import request from "supertest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { SupportedPaymentMethodType, FiatCurrency } from "@prisma/client";
import express, { Request, Application, Response, NextFunction } from "express";
import { PaymentController } from "../../src/controllers/payments";

// Extend the Express Request interface for our tests
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Mock Prisma client with all necessary methods
const mockPrisma = {
  supportedPaymentMethod: {
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
  cbe: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  telebirr: {
    findMany: vi.fn(),
  },
  mPesaKenya: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (callback) => await callback(mockPrisma)),
};

// Instantiate controller with mock
const paymentController = new PaymentController(mockPrisma as any);

// Setup Express App
const app: Application = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  req.userId = "test-user-id";
  next();
});
app.use("/payments", paymentController.routes());

describe("PaymentController API — CBE endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  //  GET /payments/methods/cbe
  it("should return 200 and an array of CBE accounts", async () => {
    mockPrisma.cbe.findMany.mockResolvedValue([
      { id: "cbe1", accountNumber: "12345678" },
    ]);
    const res = await request(app).get("/payments/methods/cbe");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].accountNumber).toBe("12345678");
  });

  //  POST /payments/methods/cbe
  it("should create a new CBE account", async () => {
    const mockSupportedMethod = {
      id: "sup-cbe",
      type: SupportedPaymentMethodType.BANK_ACCOUNT,
      method: "Commercial Bank of Ethiopia",
      currency: FiatCurrency.ETB,
      isActive: true,
      logo: "url/cbe.png",
    };
    mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
      mockSupportedMethod
    );
    mockPrisma.cbe.findUnique.mockResolvedValue(null);
    mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
    mockPrisma.userPaymentMethod.create.mockResolvedValue({
      id: "upm-cbe-1",
      userId: "test-user-id",
      supportedPaymentMethodId: "sup-cbe",
      isDefault: true,
    });
    const newAccount = {
      id: "upm-cbe-1",
      accountNumber: "87654321",
      accountName: "John Doe",
    };
    mockPrisma.cbe.create.mockResolvedValue(newAccount);

    const res = await request(app).post("/payments/methods/cbe").send({
      accountNumber: "87654321",
      accountName: "John Doe",
      isDefault: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        accountNumber: "87654321",
        accountName: "John Doe",
      })
    );
    expect(res.body.message).toBe("cbe account added successfully");
  });

  //  POST /payments/methods/cbe - Error Cases
  it("should return 400 if accountNumber is missing", async () => {
    const res = await request(app)
      .post("/payments/methods/cbe")
      .send({ accountName: "John Doe" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Invalid input data");
  });
  it("should return 400 for duplicate account number", async () => {
    // Mock the supported payment method lookup
    mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue({
      id: "sup-cbe",
      type: SupportedPaymentMethodType.BANK_ACCOUNT,
      method: "Commercial Bank of Ethiopia",
      currency: FiatCurrency.ETB,
      isActive: true,
      logo: "url/cbe.png",
    });

    mockPrisma.cbe.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "existing-id",
        accountNumber: "12345678901",
        accountName: "Jane Doe",
        userId: "some-user-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const res = await request(app)
      .post("/payments/methods/cbe")
      .send({ accountNumber: "12345678901", accountName: "Jane Doe" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("This account number is already registered");
  });

  //  Common Error Cases
  it("should return 401 if user is missing", async () => {
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use("/payments", paymentController.routes());
    const res = await request(unauthApp).get("/payments/methods/cbe");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Authentication required");
  });
});
