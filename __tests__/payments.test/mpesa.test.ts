import request from "supertest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import {
  PaymentMethodType,
  FiatCurrency,
  SupportedPaymentMethod,
  MPesaKenya,
  Cbe,
  TeleBirr,
  UserPaymentMethod,
} from "@prisma/client";
import express, { Request, Application, Response, NextFunction } from "express";
import { PaymentController } from "../../src/controllers/payments";

// Extending the Express Request interface for our tests
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Mocked data for supported payment methods with the `logo` property added.
const mockSupportedMethods: SupportedPaymentMethod[] = [
  {
    id: "sup-mpesa",
    method: "M-Pesa",
    type: PaymentMethodType.MOBILE_MONEY,
    currency: FiatCurrency.KES,
    isActive: true,
    logo: "url/mpesa.png",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "sup-cbe",
    method: "Commercial Bank of Ethiopia",
    type: PaymentMethodType.BANK_ACCOUNT,
    currency: FiatCurrency.ETB,
    isActive: true,
    logo: "url/cbe.png",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "sup-telebirr",
    method: "TeleBirr",
    type: PaymentMethodType.MOBILE_MONEY,
    currency: FiatCurrency.ETB,
    isActive: true,
    logo: "url/telebirr.png",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Mock Prisma client with all necessary methods
const mockPrisma = {
  supportedPaymentMethod: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  userPaymentMethod: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  mPesaKenya: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  cbe: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  telebirr: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (callback) => await callback(mockPrisma)),
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
app.use("/payments", paymentController.routes());

describe("PaymentController API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /payments/supported-methods", () => {
    it("should return 200 with all active supported methods", async () => {
      mockPrisma.supportedPaymentMethod.findMany.mockResolvedValue(
        mockSupportedMethods
      );
      const response = await request(app).get("/payments/supported-methods");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "sup-mpesa" }),
          expect.objectContaining({ id: "sup-cbe" }),
          expect.objectContaining({ id: "sup-telebirr" }),
        ])
      );
    });

    it("should return 401 if user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use("/payments", paymentController.routes());

      const response = await request(unauthApp).get(
        "/payments/supported-methods"
      );
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("POST /payments/methods/:methodName", () => {
    it("should create a new M-Pesa account successfully", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethods[0]
      );
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue(null);
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: "upm1",
        userId: "user123",
        supportedPaymentMethodId: "sup-mpesa",
        isDefault: true,
      });
      mockPrisma.mPesaKenya.create.mockResolvedValue({
        id: "upm1",
        phoneNumber: "254712345678",
      });

      const response = await request(app)
        .post("/payments/methods/mpesa-kenya")
        .send({
          phoneNumber: "254712345678",
          isDefault: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.phoneNumber).toBe("254712345678");
    });

    it("should return 400 for duplicate M-Pesa phone number", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethods[0]
      );
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue({
        id: "upm1",
        phoneNumber: "254712345678",
      });

      const response = await request(app)
        .post("/payments/methods/mpesa-kenya")
        .send({
          phoneNumber: "254712345678",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "This phone number is already registered"
      );
    });

    it("should return 400 for invalid input data", async () => {
      const response = await request(app)
        .post("/payments/methods/mpesa-kenya")
        .send({ phoneNumber: 123456 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("expected string");
    });
  });

  describe("GET /payments/methods/:methodName", () => {
    it("should return M-Pesa accounts for a user", async () => {
      mockPrisma.mPesaKenya.findMany.mockResolvedValue([
        { id: "upm1", phoneNumber: "254700000000" },
      ]);
      const response = await request(app).get("/payments/methods/mpesa-kenya");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
    });

    it("should return 400 for an unsupported method", async () => {
      const response = await request(app).get(
        "/payments/methods/unsupported-method"
      );
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Unsupported payment method: unsupported-method"
      );
    });
  });

  describe("PUT /payments/methods/:paymentMethodId", () => {
    it("should update phone number and isDefault status", async () => {
      const paymentMethod = {
        id: "upm1",
        userId: "user123",
        supportedPaymentMethod: mockSupportedMethods[0],
        mpesaKenya: { id: "upm1", phoneNumber: "254712345678" },
        cbe: null,
        telebirr: null,
      };

      mockPrisma.userPaymentMethod.findFirst.mockResolvedValue(paymentMethod);
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue(null);
      mockPrisma.mPesaKenya.update.mockResolvedValue({
        ...paymentMethod.mpesaKenya,
        phoneNumber: "254798765432",
      });
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.update.mockResolvedValue({
        ...paymentMethod,
        isDefault: true,
      });

      const response = await request(app)
        .put("/payments/methods/upm1")
        .send({ phoneNumber: "254798765432", isDefault: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Payment method updated successfully");
    });

    it("should return 400 for payment method not found", async () => {
      mockPrisma.userPaymentMethod.findFirst.mockResolvedValue(null);
      const response = await request(app)
        .put("/payments/methods/non-existent-id")
        .send({ isDefault: true });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Payment method not found");
    });
  });

  describe("DELETE /payments/methods/:paymentMethodId", () => {
    it("should successfully delete a payment method", async () => {
      mockPrisma.userPaymentMethod.findFirst.mockResolvedValue({
        id: "upm1",
        userId: "user123",
      });
      mockPrisma.userPaymentMethod.delete.mockResolvedValue({ id: "upm1" });
      const response = await request(app).delete("/payments/methods/upm1");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Payment method deleted successfully");
    });

    it("should return 400 for non-existent payment method", async () => {
      mockPrisma.userPaymentMethod.findFirst.mockResolvedValue(null);
      const response = await request(app).delete(
        "/payments/methods/non-existent-id"
      );
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Payment method not found");
    });
  });

  describe("GET /payments/currency/:fiatCurrency", () => {
    it("should return accounts for a specific currency (KES)", async () => {
      const mockAccounts = [
        {
          id: "upm-kes",
          userId: "user123",
          supportedPaymentMethod: mockSupportedMethods[0],
          mpesaKenya: { id: "upm-kes", phoneNumber: "254700000000" },
          cbe: null,
          telebirr: null,
        },
      ];
      mockPrisma.userPaymentMethod.findMany.mockResolvedValue(mockAccounts);
      const response = await request(app).get("/payments/currency/kes");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Use `expect.arrayContaining` to handle flexible properties
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mpesaKenya: expect.objectContaining({
              phoneNumber: "254700000000",
            }),
          }),
        ])
      );
    });

    it("should return 400 for invalid currency", async () => {
      const response = await request(app).get("/payments/currency/INVALID");
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid currency: INVALID");
    });
  });
});
