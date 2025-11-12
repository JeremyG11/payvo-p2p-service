import Decimal from "decimal.js";
import { RateService } from "@/services/rates/calculation";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaClient, AdType, CryptoCurrency } from "@prisma/client";
import { AdManagementService } from "@/services/ads/ad.management.service";

// Mock dependencies
const mockPrisma = {
  agent: { findUnique: vi.fn() },
  ad: { findFirst: vi.fn(), create: vi.fn() },
  userPaymentMethod: { findMany: vi.fn() },
} as unknown as PrismaClient;

const mockRateService = {
  getMarketRate: vi.fn(),
} as unknown as RateService;

vi.mock("@/services/rates/utils/id-generator", () => ({
  generateAdId: vi.fn().mockResolvedValue("ADV-123"),
}));

describe("AdManagementService", () => {
  let service: AdManagementService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdManagementService(mockPrisma, mockRateService);
  });

  it("creates an ad successfully", async () => {
    // Mock agent exists
    mockPrisma.agent.findUnique = vi
      .fn()
      .mockResolvedValue({ id: "agent-1", userId: "user-1" });
    // No existing active ad
    mockPrisma.ad.findFirst = vi.fn().mockResolvedValue(null);
    // Mock payment methods validation
    mockPrisma.userPaymentMethod.findMany = vi.fn().mockResolvedValue([
      {
        id: "pm-1",
        userId: "user-1",
        supportedPaymentMethod: { displayName: "Bank" },
      },
    ]);
    // Mock rate service
    mockRateService.getMarketRate = vi
      .fn()
      .mockResolvedValue({ rate: new Decimal(100) });
    // Mock ad.create
    mockPrisma.ad.create = vi.fn().mockResolvedValue({
      id: "ad-1",
      advNo: "ADV-123",
      unitPrice: 100,
      fiatCurrency: "USD",
      adType: "BUY",
      acceptedPaymentMethods: [],
    });

    const adData = {
      adType: AdType.BUY,
      unitPrice: 100,
      minLimitFiat: 50,
      maxLimitFiat: 500,
      availableAmount: 1000,
      paymentMethods: ["pm-1"],
      fromCurrency: "USD" as "USD" | "KES" | "ETB" | "UGX" | "SSP",
      toCurrency: "USD" as "USD" | "KES" | "ETB" | "UGX" | "SSP",
      paymentTimeout: new Date(Date.now() + 60 * 60 * 1000).toISOString(), 
      terms: "Some terms",
    };

    const result = await service.createAd("user-1", adData, AdType.BUY);

    expect(result.id).toBe("ad-1");
    expect(mockPrisma.ad.create).toHaveBeenCalled();
    expect(mockRateService.getMarketRate).toHaveBeenCalledWith({
      fiatCurrency: "USD",
      cryptoCurrency: CryptoCurrency.USDT,
      adType: AdType.BUY,
    });
  });
});
