import { NotFoundError, ConflictError } from '@/lib/error';
import type { TUpdateOrderStatusInput } from '@/schema/orders';
import {
  PrismaClient,
  type Order,
  OrderStatus,
  Prisma,
} from '@/generated/prisma/client';

/**
 * OrdersRepository handles all direct database interaction for the Order model.
 * It is responsible for fetching, listing, and performing status updates.
 */
export class OrdersRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Fetches a single order by ID.
   */
  public async getOrderById(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  /**
   * Lists orders with optional filtering.
   */
  public async listOrders(filters?: {
    customerId?: string;
    agentId?: string;
    status?: OrderStatus;
  }): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Updates an order's status and history in a transactional manner.
   * This method includes guards against updating completed/cancelled orders.
   */
  public async updateOrderStatus(
    orderId: string,
    input: TUpdateOrderStatusInput
  ): Promise<Order> {
    const { status } = input;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundError('Order not found');

      // Prevent invalid status transitions
      if (
        order.status === OrderStatus.COMPLETED ||
        order.status === OrderStatus.CANCELLED
      ) {
        throw new ConflictError(`Cannot update a completed or cancelled order`);
      }

      const existingHistory = Array.isArray(order.statusHistory)
        ? (order.statusHistory as Prisma.InputJsonValue[])
        : [];
      const updatedHistory: Prisma.InputJsonValue[] = [
        ...existingHistory,
        { status, at: new Date().toISOString() },
      ];

      return tx.order.update({
        where: { id: orderId },
        data: {
          status,
          statusHistory: updatedHistory,
          updatedAt: new Date(),
          completedAt:
            status === OrderStatus.COMPLETED ? new Date() : undefined,
        },
      });
    });
  }
}
