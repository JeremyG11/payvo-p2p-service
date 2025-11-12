import { describe, it, beforeEach, expect, vi } from "vitest";
import {
  PrismaClient,
  PaymentMethodCategory,
  FiatCurrency,
  SupportedPaymentMethod,
} from "@prisma/client";
import { MPesaKenyaHandler } from "../../src/controllers/payments/mpesa-kenya";
import { BadRequestError } from "../../src/lib/error";
import { Request } from "express";

// A valid UUID to use for testing
const mockPaymentMethodId = "a4a3504d-6169-4f32-849c-f126d4002e7b";

// Mocked data for supported payment methods
const mockSupportedMethod: SupportedPaymentMethod = {
  id: "sup-mpesa",
  provider: "MPesaKenya",
  displayName: "M-Pesa Kenya",
  category: PaymentMethodCategory.MOBILE_MONEY,
  currency: FiatCurrency.KES,
  isActive: true,
  logoUrl: "url/mpesa.png",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Prisma client with all necessary methods
const mockPrisma = {
  supportedPaymentMethod: {
    findFirst: vi.fn(),
  },
  userPaymentMethod: {
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  mPesaKenya: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (callback) => {
    return callback(mockPrisma);
  }),
};

// Instantiate handler with mock
const mpesaHandler = new MPesaKenyaHandler(
  mockPrisma as unknown as PrismaClient
);

describe("MPesaKenyaHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addAccount", () => {
    it("should successfully add a new M-Pesa account", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue(null);
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: mockPaymentMethodId,
      });
      mockPrisma.mPesaKenya.create.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "254712345678",
      });

      const mockRequest = {
        body: { phoneNumber: "254712345678", isDefault: true },
      } as Request;
      const result = await mpesaHandler.addAccount(mockRequest, "user123");

      expect(result.phoneNumber).toBe("254712345678");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should throw a BadRequestError if M-Pesa is not currently supported", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(null);
      const mockRequest = { body: { phoneNumber: "254712345678" } } as Request;

      await expect(
        mpesaHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        mpesaHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("MPesa Kenya is not currently supported");
    });

    it("should throw a BadRequestError for duplicate phone number", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "254712345678",
      });

      const mockRequest = { body: { phoneNumber: "254712345678" } } as Request;

      await expect(
        mpesaHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        mpesaHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("This M-Pesa Kenya account is already registered");
    });

    it("should throw a BadRequestError for invalid input data", async () => {
      const mockRequest = { body: { phoneNumber: 123456 } } as Request;
      await expect(
        mpesaHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("getAccounts", () => {
    it("should return M-Pesa accounts for a user", async () => {
      const mockAccounts = [
        { id: mockPaymentMethodId, phoneNumber: "254700000000" },
      ];
      mockPrisma.mPesaKenya.findMany.mockResolvedValue(mockAccounts);
      const result = await mpesaHandler.getAccounts("user123");

      expect(result).toEqual(mockAccounts);
      expect(mockPrisma.mPesaKenya.findMany).toHaveBeenCalledWith({
        where: { userPaymentMethod: { userId: "user123" } },
        include: {
          userPaymentMethod: { include: { supportedPaymentMethod: true } },
        },
      });
    });
  });

  describe("updateAccount", () => {
    it("should update phone number for an existing M-Pesa account", async () => {
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue(null); // No duplicate found
      mockPrisma.mPesaKenya.update.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "254798765432",
      });

      const updatedAccount = await mpesaHandler.updateAccount(
        mockPaymentMethodId,
        { phoneNumber: "254798765432" }
      );

      expect(updatedAccount?.phoneNumber).toBe("254798765432");
      expect(mockPrisma.mPesaKenya.update).toHaveBeenCalledWith({
        where: { id: mockPaymentMethodId },
        data: { phoneNumber: "254798765432" },
      });
    });

    it("should throw a BadRequestError if updating to a duplicate phone number", async () => {
      mockPrisma.mPesaKenya.findUnique.mockResolvedValue({
        id: "another-id",
        phoneNumber: "254798765432",
        displayName: "M-Pesa Kenya",
      });

      await expect(
        mpesaHandler.updateAccount(mockPaymentMethodId, {
          phoneNumber: "254798765432",
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
