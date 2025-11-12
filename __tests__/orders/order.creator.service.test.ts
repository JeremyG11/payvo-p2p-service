import express from "express";
import request from "supertest";
import { OrdersController } from "@/controllers/orders";
import { BadRequestError } from "@/lib/error";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { OrdersService } from "@/services/orders";
import { OrderStatus } from "@prisma/client";

const mockOrdersService: Partial<OrdersService> = {
  createOrder: vi.fn(),
  getOrderById: vi.fn(),
  listOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  cancelOrder: vi.fn(),
};

const app = express();
app.use(express.json());

const ordersController = new OrdersController(
  mockOrdersService as OrdersService
);
app.use("/orders", ordersController.routes());

app.use((err: any, req: any, res: any, next: any) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ message });
});

describe("OrdersController (supertest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an order successfully", async () => {
    const mockOrder = {
      id: "order-1",
      status: OrderStatus.PENDING_AGENT_CONFIRMATION,
    };
    (
      mockOrdersService.createOrder as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrder);

    const res = await request(app)
      .post("/orders")
      .send({ adId: "ad-1", paymentMethodId: "pm-1", amount: "200" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: mockOrder });
    expect(mockOrdersService.createOrder).toHaveBeenCalledWith(
      expect.any(String),
      {
        adId: "ad-1",
        paymentMethodId: "pm-1",
        amount: "200",
      }
    );
  });

  it("should handle validation errors from service", async () => {
    (
      mockOrdersService.createOrder as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new BadRequestError("Invalid input"));

    const res = await request(app)
      .post("/orders")
      .send({ adId: "ad-1", paymentMethodId: "pm-invalid", amount: "200" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: "Invalid input" });
    expect(mockOrdersService.createOrder).toHaveBeenCalled();
  });

  it("should get an order by id", async () => {
    const mockOrder = { id: "order-1", orderNumber: "ord_abc123" };
    (
      mockOrdersService.getOrderById as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrder);

    const res = await request(app).get("/orders/order-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: mockOrder });
    expect(mockOrdersService.getOrderById).toHaveBeenCalledWith("order-1");
  });
});
