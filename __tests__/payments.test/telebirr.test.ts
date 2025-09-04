import { describe, it, beforeEach, expect, vi } from "vitest";
import {
  PrismaClient,
  PaymentMethodCategory,
  FiatCurrency,
  SupportedPaymentMethod,
} from "@prisma/client";
import { TeleBirrHandler } from "../../src/controllers/payments/telebir";
import { BadRequestError } from "../../src/lib/error";
import { Request } from "express";

// A valid UUID to use for testing
const mockPaymentMethodId = "c4c3504d-6169-4f32-849c-f126d4002e7d";

// Mocked data for supported payment methods
const mockSupportedMethod: SupportedPaymentMethod = {
  id: "sup-telebirr",
  provider: "TeleBirr",
  displayName: "TeleBirr",
  category: PaymentMethodCategory.MOBILE_MONEY,
  currency: FiatCurrency.ETB,
  isActive: true,
  logoUrl: "url/telebirr.png",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create a mock for each Prisma model to be used in the test
const mockTelebirr = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockUserPaymentMethod = {
  updateMany: vi.fn(),
  create: vi.fn(),
};

const mockSupportedPaymentMethod = {
  findFirst: vi.fn(),
};

// Create the main Prisma client mock object, assigning the mock models
const mockPrisma = {
  teleBirr: mockTelebirr,
  userPaymentMethod: mockUserPaymentMethod,
  supportedPaymentMethod: mockSupportedPaymentMethod,
  $transaction: vi.fn(async (callback) => {
    return callback(mockPrisma);
  }),
};

// Instantiate handler with mock
const telebirrHandler = new TeleBirrHandler(
  mockPrisma as unknown as PrismaClient
);

describe("TeleBirrHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addAccount", () => {
    it("should successfully add a new TeleBirr account", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.teleBirr.findUnique.mockResolvedValue(null);
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: mockPaymentMethodId,
      });
      mockPrisma.teleBirr.create.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "251912345678",
      });

      const mockRequest = {
        body: { phoneNumber: "251912345678", isDefault: true },
      } as Request;
      const result = await telebirrHandler.addAccount(mockRequest, "user123");

      expect(result.phoneNumber).toBe("251912345678");
      expect(mockPrisma.supportedPaymentMethod.findFirst).toHaveBeenCalled();
      expect(mockPrisma.teleBirr.findUnique).toHaveBeenCalledWith({
        where: { phoneNumber: "251912345678" },
      });
      expect(mockPrisma.userPaymentMethod.updateMany).toHaveBeenCalledWith({
        where: { userId: "user123", isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrisma.userPaymentMethod.create).toHaveBeenCalledWith(
        expect.any(Object)
      );
      expect(mockPrisma.teleBirr.create).toHaveBeenCalledWith(
        expect.any(Object)
      );
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should throw a BadRequestError if TeleBirr is not currently supported", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(null);
      const mockRequest = { body: { phoneNumber: "251912345678" } } as Request;

      await expect(
        telebirrHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        telebirrHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("TeleBirr is not currently supported");
    });

    it("should throw a BadRequestError for duplicate phone number", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.teleBirr.findUnique.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "251912345678",
      });

      const mockRequest = { body: { phoneNumber: "251912345678" } } as Request;

      await expect(
        telebirrHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        telebirrHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("This TeleBirr account is already registered");
    });

    it("should throw a BadRequestError for invalid input data", async () => {
      const mockRequest = { body: { phoneNumber: 123456 } } as Request;
      await expect(
        telebirrHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("getAccounts", () => {
    it("should return TeleBirr accounts for a user", async () => {
      const mockAccounts = [
        { id: mockPaymentMethodId, phoneNumber: "251900000000" },
      ];
      mockPrisma.teleBirr.findMany.mockResolvedValue(mockAccounts);
      const result = await telebirrHandler.getAccounts("user123");

      expect(result).toEqual(mockAccounts);
      expect(mockPrisma.teleBirr.findMany).toHaveBeenCalledWith({
        where: { userPaymentMethod: { userId: "user123" } },
        include: {
          userPaymentMethod: { include: { supportedPaymentMethod: true } },
        },
      });
    });
  });

  describe("updateAccount", () => {
    it("should update phone number for an existing TeleBirr account", async () => {
      mockPrisma.teleBirr.findUnique.mockResolvedValue(null); // No duplicate found
      mockPrisma.teleBirr.update.mockResolvedValue({
        id: mockPaymentMethodId,
        phoneNumber: "251998765432",
      });

      const updatedAccount = await telebirrHandler.updateAccount(
        mockPaymentMethodId,
        { phoneNumber: "251998765432" }
      );

      expect(updatedAccount?.phoneNumber).toBe("251998765432");
      expect(mockPrisma.teleBirr.update).toHaveBeenCalledWith({
        where: { id: mockPaymentMethodId },
        data: { phoneNumber: "251998765432" },
      });
    });

    it("should throw a BadRequestError if updating to a duplicate phone number", async () => {
      mockPrisma.teleBirr.findUnique.mockResolvedValue({
        id: "another-id",
        phoneNumber: "251998765432",
        displayName: "TeleBirr",
      });

      await expect(
        telebirrHandler.updateAccount(mockPaymentMethodId, {
          phoneNumber: "251998765432",
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
