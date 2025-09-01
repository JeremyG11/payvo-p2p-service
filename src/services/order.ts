import {
  PrismaClient,
  Order,
  OrderStatus,
  UserRole,
  AdStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request } from 'express';

import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/error';
import { RateLimitingService } from './rate-limit';
import { OrderRepository } from './order.repository';
import { AdRepository } from './ads.repository';
import RedisClient from '@payvo/redis';
import { TCreateOrderInput } from '@/schema/orders';
import { PaginatedResponse } from '@/types/orders';

interface OrdersFilter {
  page: number;
  limit: number;
  status?: OrderStatus;
  startDate?: Date;
  endDate?: Date;
}

export class OrdersService {
  private readonly ORDER_EXPIRY_MINUTES = 15;

  constructor(
    private prisma: PrismaClient,
    private redis: RedisClient,
    private adRepo: AdRepository,
    private orderRepo: OrderRepository,
    private rateLimiter: RateLimitingService
  ) {}

  /* -------------------------- 🔹 Helpers -------------------------- */

  private async findOrderOrThrow(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  private ensureStatus(order: Order, allowed: OrderStatus[], action: string) {
    if (!allowed.includes(order.status)) {
      throw new BadRequestError(
        `Order cannot be ${action} in its current state: ${order.status}`
      );
    }
  }

  private authorize(order: Order, req: Request): void {
    const isOwner = order.customerId === req.userId;
    const isAgent = order.agentId === req.userId;
    const isAdmin = [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(
      req.userEnumRole as UserRole
    );

    if (!isOwner && !isAgent && !isAdmin) {
      throw new ForbiddenError(
        "You don't have permission to perform this action on this order"
      );
    }
  }

  private buildWhereClause(req: Request, filters: OrdersFilter) {
    const { status, startDate, endDate } = filters;
    const where: any = {};

    if (req.userEnumRole === UserRole.USER) {
      where.customerId = req.userId;
    } else if (req.userEnumRole === UserRole.AGENT) {
      where.agentId = req.userId;
    }

    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    return where;
  }

  /* -------------------------- 🔹 Create -------------------------- */

  public async createOrder(
    userId: string,
    data: TCreateOrderInput
  ): Promise<Order> {
    const { userPaymentMethodId, adId, amount } = data;
    const orderAmount = new Decimal(amount);

    return this.prisma.$transaction(async (tx) => {
      const ad = await this.adRepo.findByIdForUpdate(adId, tx);
      if (!ad) throw new NotFoundError('Ad not found');
      if (ad.status !== AdStatus.ACTIVE) {
        throw new BadRequestError('This ad is not currently active');
      }

      const minLimit = new Decimal(ad.minLimitFiat);
      const maxLimit = new Decimal(ad.maxLimitFiat);
      const available = new Decimal(ad.availableAmount);

      if (orderAmount.lessThan(minLimit)) {
        throw new BadRequestError(`Amount must be at least ${ad.minLimitFiat}`);
      }
      if (orderAmount.greaterThan(maxLimit)) {
        throw new BadRequestError(`Amount cannot exceed ${ad.maxLimitFiat}`);
      }
      if (orderAmount.greaterThan(available)) {
        throw new BadRequestError('Insufficient crypto available');
      }

      const fiatCryptoRate = await tx.fiatCryptoRate.findUnique({
        where: { id: ad.fiatCryptoRateId },
      });
      if (!fiatCryptoRate) throw new NotFoundError('FiatCryptoRate not found');

      const adRate = new Decimal(fiatCryptoRate.rawRate);
      const totalAmount = orderAmount.times(adRate);

      const newAvailable = available.minus(orderAmount);
      await this.adRepo.updateAvailableAmount(
        tx,
        adId,
        newAvailable,
        newAvailable.isZero() ? AdStatus.EXPIRED : ad.status
      );

      const order = await this.orderRepo.create({
        tx,
        userId,
        ad,
        paymentMethodId: userPaymentMethodId,
        amount: orderAmount,
        rate: adRate,
        totalAmount,
        expiryMinutes: this.ORDER_EXPIRY_MINUTES,
      });

      // TODO: publish order created event
      return order;
    });
  }

  /* -------------------------- 🔹 Getters -------------------------- */

  public async getOrderById(orderId: string, req: Request): Promise<Order> {
    const order = await this.orderRepo.findByIdWithDetails(orderId);
    if (!order) throw new NotFoundError('Order not found');
    this.authorize(order, req);
    return order;
  }

  public async getOrders(
    req: Request,
    filters: OrdersFilter
  ): Promise<PaginatedResponse<Order>> {
    const { page, limit } = filters;
    const where = this.buildWhereClause(req, filters);

    const [orders, total] = await Promise.all([
      this.orderRepo.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { ad: { select: { title: true } } },
      }),
      this.orderRepo.count(where),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /* -------------------------- 🔹 Mutations -------------------------- */

  public async cancelOrder(orderId: string, req: Request): Promise<Order> {
    const order = await this.findOrderOrThrow(orderId);
    if (order.customerId !== req.userId) {
      throw new ForbiddenError('You cannot cancel this order');
    }
    this.ensureStatus(
      order,
      [OrderStatus.PENDING_AGENT_CONFIRMATION],
      'cancelled'
    );
    return this.processOrderCancellation(order);
  }

  public async adminCancelOrder(orderId: string): Promise<Order> {
    const order = await this.findOrderOrThrow(orderId);
    return this.processOrderCancellation(order);
  }

  private async processOrderCancellation(order: Order): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      await this.adRepo.incrementAvailableAmount(
        tx,
        order.adId,
        order.fiatAmount
      );
      const updated = await this.orderRepo.updateStatus({
        tx,
        id: order.id,
        status: OrderStatus.CANCELLED,
        timestamp: new Date(),
      });
      // TODO: publish cancelled event
      return updated;
    });
  }

  public async markOrderAsPaid(orderId: string, req: Request): Promise<Order> {
    const order = await this.findOrderOrThrow(orderId);
    this.authorize(order, req);
    this.ensureStatus(
      order,
      [OrderStatus.PENDING_AGENT_CONFIRMATION],
      'marked as paid'
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.orderRepo.updateStatus({
        tx,
        id: orderId,
        status: OrderStatus.COMPLETED,
        timestamp: new Date(),
      });
      // TODO: notify agent
      return updated;
    });
  }

  public async agentConfirmOrder(
    orderId: string,
    agentId: string
  ): Promise<Order> {
    const order = await this.findOrderOrThrow(orderId);
    const ad = await this.adRepo.findById(order.adId);
    if (!ad || ad.agentId !== agentId) {
      throw new ForbiddenError('You are not authorized to confirm this order');
    }
    this.ensureStatus(
      order,
      [OrderStatus.PENDING_AGENT_CONFIRMATION],
      'confirmed'
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.orderRepo.updateStatus({
        tx,
        id: orderId,
        status: OrderStatus.AGENT_ACCEPTED,
        timestamp: new Date(),
      });
      // TODO: notify user
      return updated;
    });
  }
}
