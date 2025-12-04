import { prisma } from '@/lib/prisma';
import { OrdersRepository } from './order.repo.service';
import { OrderCreator } from './order.creator.service';
import type {
  TCreateOrderInput,
  TUpdateOrderStatusInput,
} from '@/schema/orders';
import {
  PrismaClient,
  type Order,
  OrderStatus,
} from '@/generated/prisma/client';

/**
 * OrdersService acts as a public facade for all order-related operations.
 * It delegates responsibility to the specialized OrderCreator and OrdersRepository.
 */
export class OrdersService {
  private readonly repository: OrdersRepository;
  private readonly creator: OrderCreator;

  constructor(prisma: PrismaClient) {
    this.repository = new OrdersRepository(prisma);
    this.creator = new OrderCreator(prisma);
  }

  /**
   * Create a new order using the specialized OrderCreator.
   */
  public async createOrder(
    userId: string,
    data: TCreateOrderInput
  ): Promise<Order> {
    return this.creator.createOrder(userId, data);
  }

  /**
   * Fetch a single order by ID using the OrdersRepository.
   */
  public async getOrderById(orderId: string): Promise<Order> {
    return this.repository.getOrderById(orderId);
  }

  /**
   * List orders with optional filtering using the OrdersRepository.
   */
  public async listOrders(filters?: {
    customerId?: string;
    agentId?: string;
    status?: OrderStatus;
  }): Promise<Order[]> {
    return this.repository.listOrders(filters);
  }

  /**
   * Update order status safely using the OrdersRepository.
   */
  public async updateOrderStatus(
    orderId: string,
    input: TUpdateOrderStatusInput
  ): Promise<Order> {
    return this.repository.updateOrderStatus(orderId, input);
  }

  /**
   * Cancel an order by setting its status to CANCELLED.
   */
  public async cancelOrder(orderId: string): Promise<Order> {
    return this.repository.updateOrderStatus(orderId, {
      status: OrderStatus.CANCELLED,
    });
  }
}

export const ordersService = new OrdersService(prisma);
