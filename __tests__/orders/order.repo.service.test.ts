import { prisma } from "@/lib/prisma";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";
import { NotFoundError, ConflictError } from "@/lib/error";
import { OrdersRepository } from "@/services/orders/order.repo.service";

describe("OrdersRepository", () => {
  const repo = new OrdersRepository(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getOrder throws NotFoundError if order does not exist", async () => {
    (prisma.order.findUnique as any).mockResolvedValue(null);
    await expect(repo.getOrderById("order-1")).rejects.toThrow(NotFoundError);
  });

  it("updateOrderStatus throws ConflictError for completed orders", async () => {
    interface MockOrder {
      status: OrderStatus;
      statusHistory: Array<{ status: OrderStatus; changedAt: Date }>;
    }

    interface MockOrderRepo {
      findUnique: () => Promise<MockOrder>;
      update: typeof vi.fn;
    }

    interface MockPrismaTx {
      order: MockOrderRepo;
    }

    vi.spyOn(prisma, "$transaction").mockImplementation(
      async (fn: (tx: any) => Promise<any>) =>
        fn({
          order: {
            findUnique: async () => ({
              status: OrderStatus.COMPLETED,
              statusHistory: [] as Array<{
                status: OrderStatus;
                changedAt: Date;
              }>,
            }),
            update: vi.fn,
          },
        })
    );

    await expect(
      repo.updateOrderStatus("order-1", {
        status: OrderStatus.PENDING_AGENT_CONFIRMATION,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("updateOrderStatus updates order successfully", async () => {
    const mockOrder: {
      id: string;
      status: OrderStatus;
      statusHistory: Array<{ status: OrderStatus; changedAt: Date }>;
    } = {
      id: "order-1",
      status: OrderStatus.PENDING_AGENT_CONFIRMATION,
      statusHistory: [],
    };

    interface MockOrder {
      id: string;
      status: OrderStatus;
      statusHistory: Array<{ status: OrderStatus; changedAt: Date }>;
    }

    interface MockOrderRepo {
      findUnique: () => Promise<MockOrder>;
      update: ({ data }: { data: Partial<MockOrder> }) => Promise<MockOrder>;
    }

    interface MockPrismaTx {
      order: MockOrderRepo;
    }

    vi.spyOn(prisma, "$transaction").mockImplementation(
      async (fn: (tx: any) => Promise<any>) =>
        fn({
          order: {
            findUnique: async () => mockOrder,
            update: async ({ data }: { data: Partial<MockOrder> }) => ({
              ...mockOrder,
              ...data,
            }),
          },
        })
    );

    const updated = await repo.updateOrderStatus("order-1", {
      status: OrderStatus.COMPLETED,
    });
    expect(updated.status).toBe(OrderStatus.COMPLETED);
    expect(updated.statusHistory.length).toBe(1);
  });
});
