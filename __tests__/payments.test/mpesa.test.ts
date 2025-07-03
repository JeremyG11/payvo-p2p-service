import request from "supertest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { PaymentMethodType, FiatCurrency } from "@prisma/client";
import express, { Request, Application, Response, NextFunction } from "express";
import { PaymentController } from "../../src/controllers/payments";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

const mockPrisma = {
  mPesaKenya: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  cBE: {
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
};

const paymentController = new PaymentController(mockPrisma as any);

// Setup Express App
const app: Application = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  req.user = { id: "user123" };
  next();
});

app.use("/payments", paymentController.routes());

describe("PaymentController API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /payments/mpesa-kenya", () => {
    it("should return 200 with an array of accounts", async () => {
      mockPrisma.mPesaKenya.findMany.mockResolvedValue([
        { id: "mpesa1", userId: "user123", phoneNumber: "254700000000" },
      ]);

      const response = await request(app).get("/payments/mpesa-kenya");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
    });

    it("should return 401 if no user is attached to request", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use("/payments", paymentController.routes());

      const response = await request(unauthApp).get("/payments/mpesa-kenya");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: "Unauthorized" });
    });

    it("should handle internal errors gracefully", async () => {
      mockPrisma.mPesaKenya.findMany.mockRejectedValue(new Error("DB error"));

      const response = await request(app).get("/payments/mpesa-kenya");

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("DB error");
    });
  });

  // Example POST test (assuming you later expose addMPesa as a POST endpoint)
  describe.skip("POST /payments/mpesa-kenya", () => {
    it("should create a new M-Pesa account", async () => {
      // Mock creation behavior
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

      const response = await request(app).post("/payments/mpesa-kenya").send({
        phoneNumber: "254712345678",
        isDefault: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.account.id).toBe("mpesa123");
    });
  });
});
