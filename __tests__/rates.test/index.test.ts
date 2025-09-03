import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { AdType, CryptoCurrency, FiatCurrency, Source } from "@prisma/client";
import { RateService } from "../../src/services/rates/corridor";
import { RateCalculationError } from "../../src/services/rates/corridor";
import { PricingConfigService } from "../../src/services/cache/rate/pricing";

// Mocking Prisma, Redis, Logger, and the new PricingConfigService
const prismaMock = {
  fiatCryptoRate: {
    findMany: vi.fn(),
  },
} as any;

vi.mock("@/config/env", () => ({
  config: {
    rates: {
      topAdsConsidered: 5,
    },
  },
}));
const redisCacheServiceMock = {
  get: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(),
  keys: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(),
} as any;

const loggerMock = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as any;

const pricingConfigServiceMock = {
  getMargin: vi.fn(),
  applyMargin: vi.fn(),
  upsertConfig: vi.fn(),
} as any;

// Create an instance of the new RateService with mocks
const rateService = new RateService(
  prismaMock,
  redisCacheServiceMock,
  loggerMock,
  pricingConfigServiceMock
);

describe("RateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for Redis cache miss
    redisCacheServiceMock.get.mockResolvedValue(null);
    // Default mock for Redis connection
    redisCacheServiceMock.isConnected.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMarketRate", () => {
    it("calculates rate from Binance ads and applies dynamic margin", async () => {
      // Mock the Binance ads fetch
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(105),
          volumeAvailable: new Decimal(2000),
          maxLimit: new Decimal(2000),
          updatedAt: new Date(),
        },
      ]);

      // Mock the pricing config service
      pricingConfigServiceMock.getMargin.mockResolvedValue({
        margin: new Decimal(0.01),
        minMargin: new Decimal(0.005),
        maxMargin: new Decimal(0.02),
      });

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      // The weighted average is (100*1000 + 105*2000) / 3000 = (100000 + 210000) / 3000 = 310000/3000 = 103.333
      const expectedRate = new Decimal(103.333).times(1.01);
      expect(result.rate.toNumber()).toBeCloseTo(expectedRate.toNumber(), 2);
      expect(result.source).toBe("binance");
      expect(result.adsConsidered).toBe(5);
      expect(redisCacheServiceMock.set).toHaveBeenCalled();
      expect(pricingConfigServiceMock.getMargin).toHaveBeenCalledWith(
        "ETB",
        "USDT",
        AdType.BUY
      );
    });

    it("applies minimum margin bound when calculated margin is too low", async () => {
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
      ]);

      // Mock a very low margin but with a minimum bound
      pricingConfigServiceMock.getMargin.mockResolvedValue({
        margin: new Decimal(0.001), // Very low margin
        minMargin: new Decimal(0.01), // Minimum bound is higher
        maxMargin: new Decimal(0.02),
      });

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      // Should use the minimum margin (1%) instead of 0.1%
      const expectedRate = new Decimal(100).times(1.01);
      expect(result.rate.toNumber()).toBeCloseTo(expectedRate.toNumber(), 2);
    });

    it("applies maximum margin bound when calculated margin is too high", async () => {
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
      ]);

      // Mock a very high margin but with a maximum bound
      pricingConfigServiceMock.getMargin.mockResolvedValue({
        margin: new Decimal(0.05), // Very high margin
        minMargin: new Decimal(0.01),
        maxMargin: new Decimal(0.02), // Maximum bound is lower
      });

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      // Should use the maximum margin (2%) instead of 5%
      const expectedRate = new Decimal(100).times(1.02);
      expect(result.rate.toNumber()).toBeCloseTo(expectedRate.toNumber(), 2);
    });

    it("falls back to static margin when pricing config service fails", async () => {
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
      ]);

      // Mock pricing config service failure
      pricingConfigServiceMock.getMargin.mockRejectedValue(
        new Error("DB connection failed")
      );

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      // Should fall back to static margin (1%)
      const expectedRate = new Decimal(100).times(1.01);
      expect(result.rate.toNumber()).toBeCloseTo(expectedRate.toNumber(), 2);
      expect(loggerMock.error).toHaveBeenCalledWith(
        "Failed to apply dynamic margin, using static fallback",
        expect.any(Error)
      );
    });

    it("falls back to database ads if Binance ads are not found", async () => {
      // Mock no Binance ads
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([]);

      // Mock the database ads
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE, // Still marked as BINANCE but from DB
          rawRate: new Decimal(95),
          volumeAvailable: new Decimal(500),
          maxLimit: new Decimal(500),
          updatedAt: new Date(),
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1500),
          maxLimit: new Decimal(1500),
          updatedAt: new Date(),
        },
      ]);

      // Mock the pricing config service
      pricingConfigServiceMock.getMargin.mockResolvedValue({
        margin: new Decimal(0.01),
        minMargin: null,
        maxMargin: null,
      });

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      const expectedBaseRate = new Decimal(98.75); // (95*500 + 100*1500) / 2000
      expect(result.rate.toNumber()).toBeCloseTo(
        expectedBaseRate.times(1.01).toNumber(),
        2
      );
      expect(result.source).toBe("market");
      expect(result.adsConsidered).toBe(2);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Falling back to database ads for rate calculation",
        expect.any(Object)
      );
    });

    it("throws an error if no valid ads are found in both Binance and DB", async () => {
      prismaMock.fiatCryptoRate.findMany.mockResolvedValue([]);

      await expect(
        rateService.getMarketRate({
          fiatCurrency: FiatCurrency.ETB,
          cryptoCurrency: CryptoCurrency.USDT,
          adType: AdType.BUY,
        })
      ).rejects.toThrow(RateCalculationError);

      expect(loggerMock.error).toHaveBeenCalled();
    });

    it("filters outliers based on median deviation", async () => {
      // Mock ads with a clear outlier (200)
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([]); // No Binance ads
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(105),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(200), // > 5% deviation from median 102.5
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
      ]);

      // The code should successfully filter the outlier and calculate the rate
      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      // The weighted average of the two non-outlier ads (100 and 105)
      const expectedBaseRate = new Decimal(102.5);
      const expectedRate = expectedBaseRate.times(1.01);
      expect(result.rate.toNumber()).toBeCloseTo(expectedRate.toNumber(), 2);
    });

    it("falls back to cached rate if calculation fails", async () => {
      // Mock that no ads are found
      prismaMock.fiatCryptoRate.findMany.mockResolvedValue([]);

      // Mock a stale cached value
      const cachedRate = {
        rate: "99.5", 
        source: "market",
        calculatedAt: new Date().toISOString(),
        adsConsidered: 1,
        volumeWeight: "1000",
      };

      redisCacheServiceMock.get.mockResolvedValueOnce(
        JSON.stringify(cachedRate)
      );

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      expect(result.source).toBe("market");
      expect(result.rate.toString()).toBe("99.5");
      expect(result.stale).toBe(true);
      expect(loggerMock.error).toHaveBeenCalledWith(
        "Rate calculation failed, checking for stale data",
        expect.any(Object)
      );
    });

    it("handles Redis cache service failures gracefully", async () => {
      // Mock Redis failure on get
      redisCacheServiceMock.get.mockRejectedValue(
        new Error("Redis connection failed")
      );

      // Mock successful rate calculation
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
      ]);

      pricingConfigServiceMock.getMargin.mockResolvedValue({
        margin: new Decimal(0.01),
        minMargin: null,
        maxMargin: null,
      });

      const result = await rateService.getMarketRate({
        fiatCurrency: FiatCurrency.ETB,
        cryptoCurrency: CryptoCurrency.USDT,
        adType: AdType.BUY,
      });

      expect(result.rate.toNumber()).toBeCloseTo(101, 2);
      expect(loggerMock.error).toHaveBeenCalledWith(
        "Failed to read from cache",
        expect.any(Object)
      );
    });
  });

  describe("calculateCorridorRate", () => {
    it("returns cached corridor rate if available", async () => {
      const cachedCorridorRate = {
        fromCurrency: FiatCurrency.ETB,
        toCurrency: FiatCurrency.USD,
        rate: "100.5",
        margin: "0.02",
        expiresAt: new Date().toISOString(),
        inboundRate: {
          rate: "100",
          source: "market",
          calculatedAt: new Date().toISOString(),
          adsConsidered: 1,
          volumeWeight: "1000",
        },
        outboundRate: {
          rate: "1.005",
          source: "market",
          calculatedAt: new Date().toISOString(),
          adsConsidered: 1,
          volumeWeight: "500",
        },
      };

      redisCacheServiceMock.get.mockResolvedValueOnce(
        JSON.stringify(cachedCorridorRate)
      );

      const result = await rateService.calculateCorridorRate(
        FiatCurrency.ETB,
        FiatCurrency.USD
      );

      console.log(result);

      // result.rate should be a Decimal object after parsing
      expect(result.rate.toString()).toBe("100.5");
      expect(redisCacheServiceMock.set).not.toHaveBeenCalled();
    });

    it("computes corridor from inbound and outbound rates", async () => {
      // Mock cache miss
      redisCacheServiceMock.get.mockResolvedValue(null);

      // Mock the getMarketRate calls for inbound and outbound rates
      const inboundRate = {
        rate: new Decimal(100),
        source: "binance" as "binance",
        calculatedAt: new Date(),
        adsConsidered: 5,
        volumeWeight: new Decimal(0),
      };

      const outboundRate = {
        rate: new Decimal(1.05),
        source: "binance" as "binance",
        calculatedAt: new Date(),
        adsConsidered: 5,
        volumeWeight: new Decimal(0),
      };

      vi.spyOn(rateService, "getMarketRate")
        .mockResolvedValueOnce(inboundRate)
        .mockResolvedValueOnce(outboundRate);

      const result = await rateService.calculateCorridorRate(
        FiatCurrency.ETB,
        FiatCurrency.USD
      );

      const expected = new Decimal(1.05).dividedBy(new Decimal(100));
      expect(result.rate.toString()).toBe(expected.toString());
      expect(result.inboundRate.source).toBe("binance");
      expect(result.outboundRate.source).toBe("binance");
      expect(redisCacheServiceMock.set).toHaveBeenCalled();
    });

    it("handles errors in corridor rate calculation", async () => {
      // Mock cache miss
      redisCacheServiceMock.get.mockResolvedValue(null);

      // Mock getMarketRate to throw an error for inbound rate
      vi.spyOn(rateService, "getMarketRate")
        .mockRejectedValueOnce(new RateCalculationError("No ads found"))
        .mockResolvedValueOnce({
          rate: new Decimal(1.05),
          source: "binance",
          calculatedAt: new Date(),
          adsConsidered: 5,
          volumeWeight: new Decimal(0),
        });

      await expect(
        rateService.calculateCorridorRate(FiatCurrency.ETB, FiatCurrency.USD)
      ).rejects.toThrow(RateCalculationError);

      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe("_getBaseRate (indirect testing)", () => {
    it("filters Binance ads by recency", async () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: oldDate, // Too old
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(105),
          volumeAvailable: new Decimal(2000),
          maxLimit: new Decimal(2000),
          updatedAt: new Date(), // Recent
        },
      ]);

      // This will trigger _getBaseRate indirectly
      await expect(
        rateService.getMarketRate({
          fiatCurrency: FiatCurrency.ETB,
          cryptoCurrency: CryptoCurrency.USDT,
          adType: AdType.BUY,
        })
      ).resolves.toBeDefined();

      // Should only consider the recent ad
      expect(prismaMock.fiatCryptoRate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it("handles cases where all Binance ads are filtered as outliers", async () => {
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(100),
          volumeAvailable: new Decimal(1000),
          maxLimit: new Decimal(1000),
          updatedAt: new Date(),
        },
        {
          source: Source.BINANCE,
          rawRate: new Decimal(200), // Extreme outlier
          volumeAvailable: new Decimal(2000),
          maxLimit: new Decimal(2000),
          updatedAt: new Date(),
        },
      ]);

      // This will trigger _getBaseRate indirectly and should fall back to DB ads
      prismaMock.fiatCryptoRate.findMany.mockResolvedValueOnce([
        {
          source: Source.BINANCE,
          rawRate: new Decimal(95),
          volumeAvailable: new Decimal(500),
          maxLimit: new Decimal(500),
          updatedAt: new Date(),
        },
      ]);

      await expect(
        rateService.getMarketRate({
          fiatCurrency: FiatCurrency.ETB,
          cryptoCurrency: CryptoCurrency.USDT,
          adType: AdType.BUY,
        })
      ).resolves.toBeDefined();

      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Falling back to database ads for rate calculation",
        expect.any(Object)
      );
    });
  });
});
