import { vi, describe, it, expect } from "vitest";
import { PrismaClient, AdStatus } from "@prisma/client";
import { RateCleanupWorker } from "@/services/rates/cleanup/rate-cleanup-worker";

describe("RateCleanupWorker (unit)", () => {
  it("marks ads INACTIVE and deletes expired rates", async () => {
    const prisma = {
      binanceP2PAd: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "expired-1", advNo: "123" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ad: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaClient;

    const worker = new RateCleanupWorker(prisma);

    const result = await worker.cleanupExpiredRates();

    expect(prisma.binanceP2PAd.findMany).toHaveBeenCalled();
    expect(prisma.ad.updateMany).toHaveBeenCalledWith({
      where: {
        advNo: { in: ["123"] },
        status: { not: AdStatus.INACTIVE },
      },
      data: { status: AdStatus.INACTIVE, updatedAt: expect.any(Date) },
    });
    expect(prisma.binanceP2PAd.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({ updatedAdsCount: 1, deletedRatesCount: 1 });
  });
});
