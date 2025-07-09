import request from "supertest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { PaymentMethodType, FiatCurrency } from "@prisma/client";
import express, { Request, Application, Response, NextFunction } from "express";
import { PaymentController } from "../../src/controllers/payments";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Mock Prisma structure
const mockPrisma = {
  mPesaKenya: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  userPaymentMethod: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  cBE: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

// Instantiate controller with mock
const paymentController = new PaymentController(mockPrisma as any);

// Setup Express App
const app: Application = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  req.userId = "user123";
  next();
});
app.use("/payments/payment-methods", paymentController.routes());

// Optional error handler for test debugging
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: err.message || "Unhandled error" });
});

describe("PaymentController API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /payments/payment-methods/mpesa-kenya", () => {
    it("should return 200 with an array of accounts", async () => {
      mockPrisma.mPesaKenya.findMany.mockResolvedValue([
        {
          id: "mpesa1",
          userId: "user123",
          phoneNumber: "254700000000",
          isDefault: true,
          currency: FiatCurrency.KES,
        },
      ]);

      const response = await request(app).get(
        "/payments/payment-methods/mpesa-kenya"
      );

      console.log("Response body:", response.body);
      console.log("Status:", response.status);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
    });

    it("should return 400 if required fields are missing", async () => {
      const response = await request(app)
        .post("/payments/payment-methods/mpesa-kenya")
        .send({
          // phoneNumber missing
          isDefault: true,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        "Required account details are missing"
      );
    });

    it("should return 400 if phoneNumber is an empty string", async () => {
      const response = await request(app)
        .post("/payments/payment-methods/mpesa-kenya")
        .send({ phoneNumber: "", isDefault: true });

      expect(response.status).toBe(400);
    });

    it("should return 401 if no user is attached to request", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use("/payments/payment-methods", paymentController.routes());

      const response = await request(unauthApp).get(
        "/payments/payment-methods/mpesa-kenya"
      );

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: "Unauthorized" });
    });

    it("should handle internal errors gracefully", async () => {
      mockPrisma.mPesaKenya.findMany.mockRejectedValue(new Error("DB error"));

      const response = await request(app).get(
        "/payments/payment-methods/mpesa-kenya"
      );

      console.log("Internal error response:", response.body);

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("DB error");
    });
  });

  describe("POST /payments/payment-methods/mpesa-kenya", () => {
    it("should create a new M-Pesa account", async () => {
      mockPrisma.mPesaKenya.create.mockResolvedValue({
        id: "mpesa123",
        userId: "user123",
        phoneNumber: "254712345678",
        isDefault: true,
        currency: FiatCurrency.KES,
      });

      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: "upm1",
        userId: "user123",
        paymentMethodType: PaymentMethodType.MOBILE_MONEY,
        paymentMethodId: "mpesa123",
        isDefault: true,
      });

      const response = await request(app)
        .post("/payments/payment-methods/mpesa-kenya")
        .send({
          phoneNumber: "254712345678",
          isDefault: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.account.id).toBe("mpesa123");
    });
  });
});
