import { AdStatus } from "@prisma/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateCleanupWorker } from "@/services/rates/cleanup/rate-cleanup-worker";

describe("RateCleanupWorker", () => {
  const mockPrisma = {
    binanceP2PAd: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    ad: {
      updateMany: vi.fn(),
    },
  } as any;

  let worker: RateCleanupWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new RateCleanupWorker(mockPrisma);
  });

  it("returns 0 when there are no expired rates", async () => {
    mockPrisma.binanceP2PAd.findMany.mockResolvedValueOnce([]);

    const result = await worker.cleanupExpiredRates();

    expect(result).toEqual({ updatedAdsCount: 0, deletedRatesCount: 0 });
    expect(mockPrisma.ad.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.binanceP2PAd.deleteMany).not.toHaveBeenCalled();
  });

  it("updates ads and deletes expired rates", async () => {
    mockPrisma.binanceP2PAd.findMany.mockResolvedValueOnce([
      { id: "expired-1", advNo: "123" },
      { id: "expired-2", advNo: "456" },
    ]);

    mockPrisma.ad.updateMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.binanceP2PAd.deleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await worker.cleanupExpiredRates();

    expect(mockPrisma.ad.updateMany).toHaveBeenCalledWith({
      where: {
        advNo: { in: ["123", "456"] },
        status: { not: AdStatus.INACTIVE },
      },
      data: { status: AdStatus.INACTIVE, updatedAt: expect.any(Date) },
    });

    expect(mockPrisma.binanceP2PAd.deleteMany).toHaveBeenCalledWith({
      where: { advNo: { in: ["123", "456"] } },
    });

    expect(result).toEqual({ updatedAdsCount: 2, deletedRatesCount: 2 });
  });
});
