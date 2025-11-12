import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import Decimal from "decimal.js";
import { PrismaClient, AdStatus } from "@prisma/client";
import { BinanceP2PAdSynchronizer } from "@/services/rates/binance";
import { SchedulerService } from "@/services/rates/cleanup/orchestrator";

// This test is an end-to-end test and requires a real database connection.
// If a global mock for Prisma is configured (e.g., in a setup file),
// we must explicitly unmock it here to ensure the test interacts with the database.
vi.unmock("@prisma/client");

const prisma = new PrismaClient();

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("SchedulerService full E2E", () => {
  let scheduler: SchedulerService;

  // Fake Binance service for isolation
  const mockBinanceService: BinanceP2PAdSynchronizer = {
    fetchAndStoreAdsForRates: async () => {},
    cleanupExpiredAds: async () => 0,
  } as unknown as BinanceP2PAdSynchronizer;

  beforeAll(() => {
    scheduler = new SchedulerService(prisma, mockBinanceService);
    // Set up and START the cleanup job to run every second for all tests in this suite.
    scheduler.scheduleRateCleanup("* * * * * *");
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.ad.deleteMany();
    await prisma.binanceP2PAd.deleteMany();
    await prisma.agent.upsert({
      where: { id: "agent-1" },
      update: {},
      create: {
        id: "agent-1",
        userId: "test-user-1",
        name: "Test Agent 1",
      },
    });
  });

  afterAll(async () => {
    // Stop all tasks and disconnect after tests are done
    if (scheduler) scheduler.stopAllTasks();
    await prisma.$disconnect();
  });

  it("auto-cleans expired rates and inactivates ads", async () => {
    await prisma.binanceP2PAd.create({
      data: {
        id: "expired-1",
        advNo: "123",
        tradeType: "BUY",
        asset: "USDT",
        fiatCurrency: "USD",
        price: new Decimal(100),
        expiresAt: new Date(Date.now() - 60_000),
        minSingleTransAmount: new Decimal(10),
        maxSingleTransAmount: new Decimal(1000),
        tradableQuantity: new Decimal(500),
      },
    });

    // Arrange: Insert the corresponding active ad
    await prisma.ad.create({
      data: {
        id: "ad-to-inactivate",
        agent: { connect: { userId: "test-user-1" } },
        status: AdStatus.ACTIVE,
        unitPrice: new Decimal(100),
        fiatCurrency: "USD",
        advNo: "123",
        adType: "BUY",
        minLimitFiat: new Decimal(10),
        maxLimitFiat: new Decimal(1000),
        paymentTimeout: "15",
        fromCurrency: "USD",
        toCurrency: "ETB",
      },
    });

    // Act: The scheduler is already running from `beforeAll`. We just need to wait for it to complete a cycle.
    await sleep(1500);

    // Assert: Fetch the updated records *after* the wait
    const ad = await prisma.ad.findUnique({
      where: { id: "ad-to-inactivate", advNo: "123" },
    });
    const rate = await prisma.binanceP2PAd.findUnique({
      where: { id: "expired-1", advNo: "123" },
    });

    // ✅ Assertions should now pass
    expect(ad).not.toBeNull(); // First, ensure the ad exists
    expect(ad?.status).toBe(AdStatus.INACTIVE);
    expect(rate).toBeNull();
  });
});
