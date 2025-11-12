import Decimal from 'decimal.js';
import {
  PrismaClient,
  type Order,
  OrderStatus,
  AdStatus,
  Prisma,
} from '@prisma/client';
import { config } from '@/config/env';
import type { TCreateOrderInput } from '@/schema/orders';
import { publishOrderCreated } from '@/events/producers';
import { corrNanoid } from '@/lib/utils/correlationId';
import { BadRequestError, NotFoundError } from '@/lib/error';

/**
 * OrderCreator handles the complex business logic for creating a new order,
 * including validation, calculation, database creation, and event publishing.
 * It ensures the creation process is transactional and adheres to business rules.
 */
export class OrderCreator {
  private readonly prisma: PrismaClient;

  /**
   * Initializes the OrderCreator with a Prisma client instance.
   * @param prisma The Prisma client instance for database operations.
   */
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generates a unique, correlated order number using a custom nanoid format.
   * @returns A string representing the new order number (e.g., "ord_xxxxxxxxxxx").
   */
  private generateOrderNumber(): string {
    return corrNanoid('ord');
  }

  /**
   * Creates a new order by executing three critical steps:
   * **Validation:** Checks ad existence, active status, and fiat amount limits.
   * **Atomic Creation:** Creates the order record within a database transaction (for atomicity).
   * **Event Publishing:** Publishes an `ORDER_CREATED` event to Kafka after the transaction commits.
   *
   * @param userId The ID of the user creating the order (the customer).
   * @param data The input data containing the `adId` and fiat `amount` for the order.
   * @returns A Promise that resolves with the newly created Order object.
   * @throws {NotFoundError} If the Ad specified by `adId` is not found.
   * @throws {BadRequestError} If the Ad is not ACTIVE, the order amount violates min/max limits, or no payment method is associated with the Ad.
   */
  public async createOrder(
    userId: string,
    data: TCreateOrderInput
  ): Promise<Order> {
    const { adId, amount } = data;
    const orderAmount = new Decimal(amount);
    const correlationId = corrNanoid('ord');

    try {
      // Transaction to create order safely
      const order = await this.prisma.$transaction(async (tx) => {
        const ad = await tx.ad.findUnique({
          where: { id: adId },
          include: {
            agent: true,
            acceptedPaymentMethods: { select: { paymentMethod: true } },
          },
        });

        // 1. Validation
        if (!ad) throw new NotFoundError('Ad not found');
        if (ad.status !== AdStatus.ACTIVE)
          throw new BadRequestError('Ad not active');

        const minLimit = new Decimal(ad.minLimitFiat);
        const maxLimit = new Decimal(ad.maxLimitFiat);
        if (orderAmount.lessThan(minLimit))
          throw new BadRequestError(`Minimum amount: ${ad.minLimitFiat}`);
        if (orderAmount.greaterThan(maxLimit))
          throw new BadRequestError(`Maximum amount: ${ad.maxLimitFiat}`);

        // 2. Calculation
        const quantity = orderAmount.div(ad.unitPrice);
        const paymentMethod = ad.acceptedPaymentMethods[0]?.paymentMethod;
        if (!paymentMethod)
          throw new BadRequestError('No accepted payment method for this ad');

        // 3. Database Creation
        const orderNumber = this.generateOrderNumber();
        const status = OrderStatus.PENDING_AGENT_CONFIRMATION;
        const statusHistory: Prisma.JsonArray = [
          { status, at: new Date().toISOString() },
        ];
        const expiresAt = ad.paymentTimeout;

        return tx.order.create({
          data: {
            customerId: userId,
            adId: ad.id,
            agentId: ad.agentId,
            paymentMethodId: paymentMethod.id,
            paymentDetails: paymentMethod.details as Prisma.InputJsonValue,
            orderNumber,
            orderAmount,
            quantity,
            unitPrice: new Decimal(ad.unitPrice),
            status,
            statusHistory: statusHistory as Prisma.InputJsonValue[],
            expiresAt,
          },
        });
      });

      // Publish Event after transaction commits
      try {
        await publishOrderCreated({
          key: order.id,
          value: {
            orderId: order.id,
            orderNumber: correlationId,
            adId: order.adId,
            customerId: order.customerId,
            agentId: order.agentId,
            paymentMethodId: order.paymentMethodId,
            paymentDetails: order.paymentDetails as Prisma.JsonValue,
            orderAmount: order.orderAmount.toString(),
            quantity: order.quantity.toString(),
            unitPrice: order.unitPrice.toString(),
            status: order.status,
            statusHistory: order.statusHistory,
            createdAt: order.createdAt.toISOString(),
            expiresAt: order.expiresAt?.toISOString() ?? '',
            metadata: { source: config.serviceName, correlationId },
          },
        });
      } catch (err) {
        console.error('Failed to publish order.created event', err);
        // Optionally push to a retry queue or dead-letter system
      }

      return order;
    } catch (err) {
      console.error('Order creation failed', {
        userId,
        adId: data.adId,
        error: err,
      });
      throw err;
    }
  }
}
