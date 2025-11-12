import express from "express";
import request from "supertest";
import { BadRequestError } from "@/lib/error";
import { OrdersService } from "@/services/orders";
import { OrdersController } from "@/controllers/orders";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { OrderStatus } from "@prisma/client";

// Mock OrdersService
const mockOrdersService: Partial<OrdersService> = {
  createOrder: vi.fn(),
  getOrderById: vi.fn(),
  listOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  cancelOrder: vi.fn(),
};

// Initialize controller and express app
const ordersController = new OrdersController(
  mockOrdersService as OrdersService
);

const app = express();
app.use(express.json());
app.use("/orders", ordersController.routes());

// Middleware: wrap all successful responses in { success: true, data }
app.use((req, res, next) => {
  const oldJson = res.json.bind(res);
  res.json = (data) => oldJson({ success: true, data });
  next();
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  const status = err.status || (err instanceof BadRequestError ? 400 : 500);
  res.status(status).json({ message: err.message });
});

describe("OrdersController (CRUD Supertest DRY)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should create an order successfully", async () => {
    const mockOrder = { id: "order-1", orderNumber: "ord_abc123" };
    (
      mockOrdersService.createOrder as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrder);

    const res = await request(app)
      .post("/orders")
      .send({ adId: "ad-1", paymentMethodId: "pm-1", amount: "200" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: mockOrder });
    expect(mockOrdersService.createOrder).toHaveBeenCalled();
  });

  it("should handle validation errors on create", async () => {
    (
      mockOrdersService.createOrder as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new BadRequestError("Invalid input"));

    const res = await request(app)
      .post("/orders")
      .send({ adId: "ad-1", paymentMethodId: "pm-invalid", amount: "200" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: "Invalid input" });
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

  it("should list all orders", async () => {
    const mockOrders = [
      { id: "order-1", orderNumber: "ord_abc123" },
      { id: "order-2", orderNumber: "ord_def456" },
    ];
    (
      mockOrdersService.listOrders as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrders);

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: mockOrders });
    expect(mockOrdersService.listOrders).toHaveBeenCalled();
  });

  it("should update an order status", async () => {
    const mockOrder = { id: "order-1", status: OrderStatus.COMPLETED };
    (
      mockOrdersService.updateOrderStatus as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrder);

    const res = await request(app)
      .patch("/orders/order-1/status")
      .send({ status: OrderStatus.COMPLETED });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: mockOrder });
    expect(mockOrdersService.updateOrderStatus).toHaveBeenCalledWith(
      "order-1",
      {
        status: OrderStatus.COMPLETED,
      }
    );
  });

  it("should cancel an order", async () => {
    const mockOrder = { id: "order-1", status: OrderStatus.CANCELLED };
    (
      mockOrdersService.cancelOrder as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockOrder);

    const res = await request(app).patch("/orders/order-1/cancel");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: mockOrder });
    expect(mockOrdersService.cancelOrder).toHaveBeenCalledWith("order-1");
  });
});
