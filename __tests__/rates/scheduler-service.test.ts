import { describe, it, expect, vi, beforeEach } from "vitest";
import { BinanceP2PService } from "@/services/rates/binance";
import { SchedulerService } from "@/services/rates/cleanup/orchestrator";

describe("SchedulerService", () => {
  const mockPrisma = {} as any;
  const mockBinanceService = {
    fetchAndStoreAdsForRates: vi.fn(),
    cleanupExpiredAds: vi.fn(),
  } as unknown as BinanceP2PService;

  let service: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SchedulerService(mockPrisma, mockBinanceService);
  });

  it("triggers manual rate cleanup", async () => {
    const spy = vi
      .spyOn(service["rateCleanupWorker"], "cleanupExpiredRates")
      .mockResolvedValue({ updatedAdsCount: 1, deletedRatesCount: 1 });

    const result = await service.manualRateCleanup();
    expect(result.updatedAdsCount).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it("triggers manual binance fetch", async () => {
    const spy = vi
      .spyOn(service["binanceSyncWorker"], "fetchBinanceAds")
      .mockResolvedValue();

    await service.manualBinanceFetch();
    expect(spy).toHaveBeenCalled();
  });
});
