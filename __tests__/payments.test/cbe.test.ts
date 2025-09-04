import { describe, it, beforeEach, expect, vi } from "vitest";
import {
  PrismaClient,
  PaymentMethodCategory,
  FiatCurrency,
  SupportedPaymentMethod,
} from "@prisma/client";
import { CBEHandler } from "../../src/controllers/payments/cbe";
import { BadRequestError } from "../../src/lib/error";
import { Request } from "express";

// A valid UUID to use for testing
const mockPaymentMethodId = "b1b2a3a4-4c6e-4f7d-a1b2-1c2d3e4f5a6b";

// Mocked data for supported payment methods
const mockSupportedMethod: SupportedPaymentMethod = {
  id: "sup-cbe",
  provider: "CBE",
  displayName: "Commercial Bank of Ethiopia",
  category: PaymentMethodCategory.BANK_TRANSFER,
  currency: FiatCurrency.ETB,
  isActive: true,
  logoUrl: "url/cbe.png",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create a mock for each Prisma model to be used in the test
const mockCbe = {
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
  cbe: mockCbe,
  userPaymentMethod: mockUserPaymentMethod,
  supportedPaymentMethod: mockSupportedPaymentMethod,
  $transaction: vi.fn(async (callback) => {
    return callback(mockPrisma);
  }),
};

// Instantiate handler with mock
const cbeHandler = new CBEHandler(mockPrisma as unknown as PrismaClient);

describe("CBEHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addAccount", () => {
    it("should successfully add a new CBE account", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.cbe.findUnique.mockResolvedValue(null);
      mockPrisma.userPaymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.userPaymentMethod.create.mockResolvedValue({
        id: mockPaymentMethodId,
      });
      mockPrisma.cbe.create.mockResolvedValue({
        id: mockPaymentMethodId,
        accountNumber: "1000200030004",
      });

      const mockRequest = {
        body: {
          accountNumber: "1000200030004",
          isDefault: true,
          accountName: "My CBE Account",
        },
      } as Request;
      const result = await cbeHandler.addAccount(mockRequest, "user123");

      expect(result.accountNumber).toBe("1000200030004");
      expect(mockPrisma.supportedPaymentMethod.findFirst).toHaveBeenCalled();
      expect(mockPrisma.cbe.findUnique).toHaveBeenCalledWith({
        where: { accountNumber: "1000200030004" },
      });
      expect(mockPrisma.userPaymentMethod.updateMany).toHaveBeenCalledWith({
        where: { userId: "user123", isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrisma.userPaymentMethod.create).toHaveBeenCalledWith(
        expect.any(Object)
      );
      expect(mockPrisma.cbe.create).toHaveBeenCalledWith(expect.any(Object));
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should throw a BadRequestError if CBE is not currently supported", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(null);
      const mockRequest = {
        body: {
          accountNumber: "1000200030004",
          isDefault: false,
          accountName: "Test Account",
        },
      } as Request;

      await expect(
        cbeHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        cbeHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("CBE is not currently supported");
    });

    it("should throw a BadRequestError for duplicate account number", async () => {
      mockPrisma.supportedPaymentMethod.findFirst.mockResolvedValue(
        mockSupportedMethod
      );
      mockPrisma.cbe.findUnique.mockResolvedValue({
        id: mockPaymentMethodId,
        accountNumber: "1000200030004",
      });

      const mockRequest = {
        body: {
          accountNumber: "1000200030004",
          isDefault: false,
          accountName: "Test Account",
        },
      } as Request;

      await expect(
        cbeHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
      await expect(
        cbeHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow("This account number is already registered");
    });

    it("should throw a BadRequestError for invalid input data", async () => {
      const mockRequest = { body: { accountNumber: 123456 } } as Request;
      await expect(
        cbeHandler.addAccount(mockRequest, "user123")
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("getAccounts", () => {
    it("should return CBE accounts for a user", async () => {
      const mockAccounts = [
        { id: mockPaymentMethodId, accountNumber: "1000200030004" },
      ];
      mockPrisma.cbe.findMany.mockResolvedValue(mockAccounts);
      const result = await cbeHandler.getAccounts("user123");

      expect(result).toEqual(mockAccounts);
      expect(mockPrisma.cbe.findMany).toHaveBeenCalledWith({
        where: { userPaymentMethod: { userId: "user123" } },
        include: {
          userPaymentMethod: { include: { supportedPaymentMethod: true } },
        },
      });
    });
  });

  describe("updateAccount", () => {
    it("should update phone number for an existing CBE account", async () => {
      mockPrisma.cbe.findUnique.mockResolvedValue(null);
      mockPrisma.cbe.update.mockResolvedValue({
        id: mockPaymentMethodId,
        accountNumber: "1000200030005",
      });

      const updatedAccount = await cbeHandler.updateAccount(
        mockPaymentMethodId,
        { accountNumber: "1000200030005" }
      );

      expect(updatedAccount?.accountNumber).toBe("1000200030005");
      expect(mockPrisma.cbe.update).toHaveBeenCalledWith({
        where: { id: mockPaymentMethodId },
        data: { accountNumber: "1000200030005" },
      });
    });

    it("should throw a BadRequestError if updating to a duplicate account number", async () => {
      mockPrisma.cbe.findUnique.mockResolvedValue({
        id: "another-id",
        accountNumber: "1000200030005",
        displayName: "My CBE Account",
      });

      await expect(
        cbeHandler.updateAccount(mockPaymentMethodId, {
          accountNumber: "1000200030005",
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
