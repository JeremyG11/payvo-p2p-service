import request from "supertest";
import express from "express";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { PaymentController } from "../../src/controllers/payments";

const mockPrisma = {
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

function buildApp(withUser = true) {
  const app = express();
  app.use(express.json());
  if (withUser) {
    app.use((req, res, next) => {
      req.userId = "test-user-id"; 
      next();
    });
    
  }
  // register necessary routes
  const router = express.Router();
  router.post("/cbe", paymentController.addCBE.bind(paymentController));
  router.get("/cbe", paymentController.getCBEAccounts.bind(paymentController));
  app.use("/payments", router);
  return app;
}

describe("PaymentController API — CBE endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /payments/cbe", () => {
    it("should return 200 and an array of CBE accounts", async () => {
      mockPrisma.cBE.findMany.mockResolvedValue([
        { id: "cbe1", userId: "user123", accountNumber: "12345678" },
      ]);

      const app = buildApp();
      const res = await request(app).get("/payments/cbe");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].accountNumber).toBe("12345678");
    });

    it("should return 401 if user is missing", async () => {
      const app = buildApp(false);
      const res = await request(app).get("/payments/cbe");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: "Unauthorized" });
    });

    it("should return 500 on internal error", async () => {
      mockPrisma.cBE.findMany.mockRejectedValue(new Error("DB fail"));
      const app = buildApp();
      const res = await request(app).get("/payments/cbe");

      expect(res.status).toBe(500);
      expect(res.body.message).toContain("DB fail");
    });
  });

  describe("POST /payments/cbe", () => {
    it("should create a new CBE account", async () => {
      const newAccount = {
        id: "cbe123",
        userId: "user123",
        accountNumber: "87654321",
        isDefault: true,
        currency: "ETB",
      };
      mockPrisma.cBE.create.mockResolvedValue(newAccount);
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: "upm-cbe-1",
        userId: "user123",
        paymentMethodType: "BANK_ACCOUNT",
        paymentMethodId: "cbe123",
        isDefault: true,
      });

      const app = buildApp();
      const res = await request(app)
        .post("/payments/cbe")
        .send({ accountNumber: "87654321", isDefault: true });

      expect(res.status).toBe(201);
      expect(res.body.account).toEqual(
        expect.objectContaining({
          id: "cbe123",
          accountNumber: "87654321",
        })
      );
      expect(res.body.message).toMatch(
        /BANK_ACCOUNT account added successfully/i
      );
    });

    it("should return 400 if accountNumber is missing", async () => {
      const app = buildApp();
      const res = await request(app)
        .post("/payments/cbe")
        .send({ isDefault: false });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "Required account details are missing.",
      });
    });

    it("should return 401 if no user", async () => {
      const app = buildApp(false);
      const res = await request(app)
        .post("/payments/cbe")
        .send({ accountNumber: "1234" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: "Unauthorized" });
    });

    it("should return 500 on DB error", async () => {
      mockPrisma.cBE.create.mockRejectedValue(new Error("DB bad"));
      const app = buildApp();
      const res = await request(app)
        .post("/payments/cbe")
        .send({ accountNumber: "1234" });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain("DB bad");
    });
  });
});
