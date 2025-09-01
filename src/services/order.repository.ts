import { Prisma, Order, OrderStatus, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByIdWithDetails(id: string): Promise<OrderWithDetails | null>;
  findMany(params: FindManyOrderParams): Promise<Order[]>;
  count(where?: Prisma.OrderWhereInput): Promise<number>;
  create(data: CreateOrderData): Promise<Order>;
  updateStatus(data: UpdateOrderStatusData): Promise<Order>;
}

interface OrderWithDetails extends Order {
  ad: { agent: { id: string } };
  userPaymentMethod: Prisma.UserPaymentMethodGetPayload<true>;
}

interface FindManyOrderParams {
  where?: Prisma.OrderWhereInput;
  skip?: number;
  take?: number;
  orderBy?: Prisma.OrderOrderByWithRelationInput;
  include?: Prisma.OrderInclude;
}

interface CreateOrderData {
  tx: Prisma.TransactionClient;
  userId: string;
  orderNumber?: string;
  ad: Prisma.AdGetPayload<{ include: { agent: true } }>;
  paymentMethodId: string;
  amount: Decimal;
  rate: Decimal;
  totalAmount: Decimal;
  recipientDetails: Prisma.InputJsonValue;
  expiryMinutes: number;
}

interface UpdateOrderStatusData {
  tx: Prisma.TransactionClient;
  id: string;
  status: OrderStatus;
  timestamp: Date;
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private prisma: Prisma.TransactionClient | PrismaClient) {}

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  async findByIdWithDetails(id: string): Promise<OrderWithDetails | null> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ad: { include: { agent: { select: { id: true } } } },
        paymentMethod: true,
      },
    });

    if (!order) return null;

    return {
      ...order,
      ad: { agent: { id: order.ad.agent.id } },
      userPaymentMethod: order.paymentMethod,
    } as OrderWithDetails;
  }

  async findMany(params: FindManyOrderParams): Promise<Order[]> {
    return this.prisma.order.findMany(params);
  }

  async count(where?: Prisma.OrderWhereInput): Promise<number> {
    return this.prisma.order.count({ where });
  }

  async create(data: CreateOrderData): Promise<Order> {
    const {
      tx,
      userId,
      ad,
      paymentMethodId,
      amount,
      rate,
      totalAmount,
      orderNumber,
      expiryMinutes,
    } = data;

    return tx.order.create({
      data: {
        orderNumber,
        customer: { connect: { id: userId } },
        ad: { connect: { id: ad.id } },
        agent: { connect: { id: ad.agentId } },
        paymentMethod: { connect: { id: paymentMethodId } },
        fiatAmount: amount.toString(),
        cryptoAmount: totalAmount.toString(),
        unitPrice: rate.toString(),
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        status: OrderStatus.PENDING_AGENT_CONFIRMATION,
      },
    });
  }

  async updateStatus(data: UpdateOrderStatusData): Promise<Order> {
    const { tx, id, status, timestamp } = data;

    return tx.order.update({
      where: { id },
      data: {
        status,
        ...(timestamp && { completedAt: timestamp }),
      },
    });
  }
}
