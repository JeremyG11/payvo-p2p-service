import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { p2pCacheService } from '@/services/cache';
import { config } from '@/config/env';
import { PricingConfigService } from '@/services/cache/rate/pricing';
import { DecimalAwareCacheService } from '@/services/cache/rate/dm-aware-cache';

import { MarginApplier } from './margin-applier';
import { AdRateFetcher } from './ad-rate-fetcher';
import { RateCalculator } from './rate-calculator';
import type { ICacheService } from '@/types/cache';
import type {
  ICalculatedRate,
  ICorridorRate,
  RateCalculationInput,
} from '@/types/interface';

// Configuration constants from the original file, kept here as they relate to overall service behavior
const MARGIN_CONFIG = {
  INBOUND: validateMargin(0.01, process.env.INBOUND_MARGIN),
  OUTBOUND: validateMargin(0.01, process.env.OUTBOUND_MARGIN),
  MIN_VOLUME_THRESHOLD: 1000,
  MAX_RATE_DEVIATION: 0.05,
  CACHE_TTL_SECONDS: 300,
  DB_QUERY_RECENCY_MINUTES: 5,
};

/**
 * Validates and parses a margin value from a string.
 */
function validateMargin(defaultValue: number, margin?: string): number {
  const parsed = margin ? parseFloat(margin) : null;
  if (parsed === null || isNaN(parsed) || parsed < 0 || parsed > 1) {
    logger.warn(
      `Invalid margin provided, using default value: ${defaultValue}`
    );
    return defaultValue;
  }
  return parsed;
}

// Type guard to check if an object is a ICalculatedRate
function isCalculatedRate(obj: any): obj is ICalculatedRate {
  return (
    obj &&
    typeof obj.rate !== 'undefined' &&
    typeof obj.volumeWeight !== 'undefined'
  );
}

/**
 * Service for calculating exchange rates using market data from P2P ads.
 * It abstracts data fetching, rate calculation, and caching logic by orchestrating
 * dedicated worker services.
 */
export class RateService {
  private readonly adRateFetcher: AdRateFetcher;
  private readonly marginApplier: MarginApplier;
  private readonly topAdsConsidered: number;

  /**
   * Constructs the RateService with necessary dependencies.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: ICacheService,
    private readonly log: typeof logger,
    pricingConfigService: PricingConfigService // Dependency injected but used by MarginApplier
  ) {
    this.topAdsConsidered = Number(config.rates.topAdsConsidered);

    // Instantiate worker services and inject necessary dependencies
    const rateCalculator = new RateCalculator();
    this.adRateFetcher = new AdRateFetcher(prisma, rateCalculator, log);
    this.marginApplier = new MarginApplier(pricingConfigService, log);
  }

  /**
   * Calculates the exchange rate between two fiat currencies via USDT.
   */
  public async calculateCorridorRate(
    fromCurrency: FiatCurrency,
    toCurrency: FiatCurrency
  ): Promise<ICorridorRate> {
    const cacheKey = `corridorRate:${fromCurrency}:${toCurrency}`;
    const context = { fromCurrency, toCurrency };

    return this._getOrCalculate({
      key: cacheKey,
      context,
      ttl: MARGIN_CONFIG.CACHE_TTL_SECONDS,
      calculateFn: () =>
        this._fetchAndCalculateCorridorRate(fromCurrency, toCurrency),
    });
  }

  /**
   * Calculates the volume-weighted market rate for a single fiat-crypto pair.
   */
  public async getMarketRate(
    input: RateCalculationInput
  ): Promise<ICalculatedRate> {
    const cacheKey = `rate:${input.fiatCurrency}:${input.cryptoCurrency}:${input.adType}`;

    return this._getOrCalculate({
      key: cacheKey,
      context: input,
      ttl: MARGIN_CONFIG.CACHE_TTL_SECONDS,
      calculateFn: () => this._fetchAndCalculateMarketRate(input),
    });
  }

  /**
   * Fetches the necessary market rates and combines them to calculate the final corridor rate.
   * @private
   */
  private async _fetchAndCalculateCorridorRate(
    fromCurrency: FiatCurrency,
    toCurrency: FiatCurrency
  ): Promise<ICorridorRate> {
    const inboundRatePromise = this.getMarketRate({
      fiatCurrency: fromCurrency,
      cryptoCurrency: CryptoCurrency.USDT,
      adType: AdType.BUY,
    });

    const outboundRatePromise = this.getMarketRate({
      fiatCurrency: toCurrency,
      cryptoCurrency: CryptoCurrency.USDT,
      adType: AdType.SELL,
    });

    const [inboundRate, outboundRate] = await Promise.all([
      inboundRatePromise,
      outboundRatePromise,
    ]);

    // Corridor Rate = Outbound Rate / Inbound Rate
    const corridorRate = outboundRate.rate.div(inboundRate.rate);

    return {
      fromCurrency,
      toCurrency,
      rate: corridorRate,
      inboundRate,
      outboundRate,
      margin: new Decimal(MARGIN_CONFIG.INBOUND + MARGIN_CONFIG.OUTBOUND),
      expiresAt: new Date(Date.now() + MARGIN_CONFIG.CACHE_TTL_SECONDS * 1000),
    };
  }

  /**
   * Fetches the base market rate and applies the necessary pricing margin.
   * @private
   */
  private async _fetchAndCalculateMarketRate(
    input: RateCalculationInput
  ): Promise<ICalculatedRate> {
    // 1. Get Base Rate from the dedicated fetcher (handles Binance primary/DB fallback)
    const { baseRate, source } = await this.adRateFetcher.getBaseRate(
      input,
      this.topAdsConsidered
    );

    // 2. Apply Margin using the dedicated applier (handles dynamic/static margin)
    const finalRate = await this.marginApplier.applyMargin(
      baseRate,
      input.adType,
      input.fiatCurrency,
      input.cryptoCurrency
    );

    return {
      rate: finalRate,
      source: source,
      calculatedAt: new Date(),
      adsConsidered: this.topAdsConsidered,
      volumeWeight: new Decimal(0),
    };
  }

  /**
   * A generic utility method to handle get-or-calculate-and-cache logic.
   * @private
   */
  private async _getOrCalculate<T extends { stale?: boolean }>(options: {
    key: string;
    context: object;
    ttl: number;
    calculateFn: () => Promise<T>;
  }): Promise<T> {
    const { key, context, ttl, calculateFn } = options;

    try {
      const cachedData = await this.cache.get<T>(key);
      if (cachedData) {
        return cachedData;
      }
    } catch (err) {
      this.log.error('Failed to read from cache', { key, context, err });
    }

    try {
      const result = await calculateFn();
      // Asynchronously write to cache, don't await to avoid blocking the response
      this.cache.set(key, result, ttl).catch((err: unknown) => {
        this.log.error('Failed to write to cache', { key, context, err });
      });
      return result;
    } catch (err) {
      this.log.error('Rate calculation failed, checking for stale data', {
        key,
        context,
        err,
      });
      try {
        const staleData = await this.cache.get<T>(key);
        if (staleData) {
          staleData.stale = true;
          if (isCalculatedRate(staleData)) {
            staleData.source = 'fallback';
          }
          return staleData;
        }
      } catch (cacheErr) {
        this.log.error('Failed to read stale cache data', {
          key,
          context,
          cacheErr,
        });
      }
      throw err;
    }
  }
}

const cacheInstance = p2pCacheService;
if (!cacheInstance) {
  throw new Error(
    'P2P cache service is not initialized; set REDIS_URL to enable caching'
  );
}

const decimalCache = new DecimalAwareCacheService(cacheInstance);
const pricingConfigService = new PricingConfigService(prisma);

export const rateService = new RateService(
  prisma,
  decimalCache,
  logger,
  pricingConfigService
);
