import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
  BinanceP2PAd,
} from '@prisma/client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { p2pCacheService } from '@/services/cache';
import { ICacheService } from '@/types/cache';
import { config } from '@/config/env';
import Decimal from 'decimal.js';
import { PricingConfigService } from '@/services/cache/rate/pricing';
import { DecimalAwareCacheService } from '@/services/cache/rate/dm-aware-cache';
import {
  ICalculatedRate,
  ICorridorRate,
  RateCalculationInput,
  RawAdRate,
} from '../../../types/interface';

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
 * @param defaultValue The default value to use if the margin is invalid.
 * @param margin The margin value string to validate.
 * @returns The validated margin value.
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

/**
 * Custom error class for rate calculation failures.
 */
export class RateCalculationError extends Error {
  public context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RateCalculationError';
    this.context = context;
  }
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
 * It abstracts data fetching, rate calculation, and caching logic.
 */
export class RateService {
  /**
   * Constructs the RateService with necessary dependencies.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: ICacheService,
    private readonly log: typeof logger,
    private readonly pricingConfigService: PricingConfigService
  ) {}

  /**
   * Calculates the exchange rate between two fiat currencies via USDT.
   * The rate is calculated by dividing the outbound rate by the inbound rate.
   * @param fromCurrency - The starting fiat currency.
   * @param toCurrency - The target fiat currency.
   * @returns A promise that resolves to the calculated corridor rate.
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
   * The rate is derived from recent, high-volume P2P ads and a median deviation filter.
   * @param input - The input parameters for the rate calculation.
   * @returns A promise that resolves to the calculated market rate.
   * @throws {RateCalculationError} If no valid ads are found.
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
   * Fetches relevant ads, filters them, and calculates the final market rate.
   * This method first attempts to use Binance as the primary source,
   * falling back to the local database if the Binance data is unavailable or invalid.
   * @private
   * @param input - The input parameters for the rate calculation.
   * @returns A promise resolving to the raw calculated rate object before caching.
   * @throws {RateCalculationError} If no valid ads are found at any stage.
   */
  private async _fetchAndCalculateMarketRate(
    input: RateCalculationInput
  ): Promise<ICalculatedRate> {
    const context = { input };
    const topAdsConsidered = Number(config.rates.topAdsConsidered);

    // Attempt to get rate from Binance (primary source)
    try {
      const baseRate = await this._getRateFromBinance(input, topAdsConsidered);
      const finalRate = await this._applyMargin(
        baseRate,
        input.adType,
        input.fiatCurrency,
        input.cryptoCurrency
      );

      return {
        rate: finalRate,
        source: 'binance',
        calculatedAt: new Date(),
        adsConsidered: topAdsConsidered,
        volumeWeight: new Decimal(0), // Volume weight not tracked for Binance
      };
    } catch (binanceError) {
      this.log.warn('Failed to get Binance rate, falling back to database', {
        error:
          binanceError instanceof Error
            ? binanceError.message
            : String(binanceError),
        context,
      });
      // Fallback to the database-based calculation using BinanceP2PAd
      return this._getRateFromDatabase(input);
    }
  }

  /**
   * Gets the base rate from Binance P2P ads.
   * @private
   */
  private async _getRateFromBinance(
    input: RateCalculationInput,
    topN: number
  ): Promise<Decimal> {
    const binanceAds = await this.prisma.binanceP2PAd.findMany({
      where: {
        fiatCurrency: input.fiatCurrency,
        asset: input.cryptoCurrency,
        tradeType: input.adType,
        expiresAt: { gt: new Date() },
        fetchedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy:
        input.adType === AdType.BUY ? { price: 'asc' } : { price: 'desc' },
      take: 20,
    });

    if (binanceAds.length === 0) {
      throw new RateCalculationError('No active Binance ads found', {
        ...input,
      });
    }

    const rawAds = this._mapToRawAdRate(binanceAds);
    const filteredAds = this._filterAdsByDeviation(rawAds);

    if (filteredAds.length === 0) {
      throw new RateCalculationError('All Binance ads filtered as outliers', {
        ...input,
        totalAds: binanceAds.length,
      });
    }

    const topAds = filteredAds.slice(0, topN);
    const averageRate = this._calculateVolumeWeightedRate(topAds);

    this.log.info('Calculated base rate from Binance ads', {
      ...input,
      rate: averageRate.toString(),
      adsConsidered: topAds.length,
      totalAdsAvailable: binanceAds.length,
    });

    return averageRate;
  }

  /**
   * Fetches and calculates rate from database ads.
   * @private
   */
  private async _getRateFromDatabase(
    input: RateCalculationInput
  ): Promise<ICalculatedRate> {
    const context = { input };
    const ads = await this._fetchRelevantAdsFromDB(input);
    if (ads.length === 0) {
      throw new RateCalculationError(
        'No recent, high-volume ads found in database',
        { context }
      );
    }

    const validAds = this._filterAdsByDeviation(ads);
    if (validAds.length === 0) {
      throw new RateCalculationError(
        'No ads remaining after deviation filtering in database',
        { context, adsCount: ads.length }
      );
    }

    const vwRate = this._calculateVolumeWeightedRate(validAds);
    const finalRate = await this._applyMargin(
      vwRate,
      input.adType,
      input.fiatCurrency,
      input.cryptoCurrency
    );

    return {
      rate: finalRate,
      source: 'market',
      calculatedAt: new Date(),
      adsConsidered: validAds.length,
      volumeWeight: new Decimal(0),
    };
  }

  /**
   * Fetches a list of relevant, active, and recent Binance P2P ads from the database.
   * @private
   */
  private async _fetchRelevantAdsFromDB(
    input: RateCalculationInput
  ): Promise<RawAdRate[]> {
    const binanceAds = await this.prisma.binanceP2PAd.findMany({
      where: {
        fiatCurrency: input.fiatCurrency,
        asset: input.cryptoCurrency,
        tradeType: input.adType,
        expiresAt: { gt: new Date() },
        fetchedAt: {
          gte: new Date(
            Date.now() - MARGIN_CONFIG.DB_QUERY_RECENCY_MINUTES * 60 * 1000
          ),
        },
      },
      orderBy:
        input.adType === AdType.BUY ? { price: 'asc' } : { price: 'desc' },
      take: 20,
    });

    return this._mapToRawAdRate(binanceAds);
  }

  /**
   * Maps Prisma records to a standardized RawAdRate type.
   * @private
   */
  private _mapToRawAdRate(ads: BinanceP2PAd[]): RawAdRate[] {
    return ads.map((ad) => ({
      rawRate: ad.price,
      volumeAvailable: ad.tradableQuantity || new Decimal(0),
      maxLimit: ad.maxSingleTransAmount,
    }));
  }

  /**
   * Filters a list of ads, removing those whose rates deviate significantly from the median.
   * @private
   */
  private _filterAdsByDeviation(ads: RawAdRate[]): RawAdRate[] {
    if (ads.length === 0) return [];
    const rates = ads.map((ad) => ad.rawRate.toNumber());
    const median = this._calculateMedian(rates);
    return ads.filter((ad) => {
      const deviation = Math.abs(ad.rawRate.toNumber() - median) / median;
      return deviation <= MARGIN_CONFIG.MAX_RATE_DEVIATION;
    });
  }

  /**
   * Calculates the volume-weighted average rate from a list of ads.
   * @private
   */
  private _calculateVolumeWeightedRate(ads: RawAdRate[]): Decimal {
    if (ads.length === 0) return new Decimal(0);
    let totalVolume = new Decimal(0);
    let weightedSum = new Decimal(0);

    for (const ad of ads) {
      const volume = Decimal.min(
        ad.volumeAvailable,
        ad.maxLimit ?? ad.volumeAvailable
      );
      totalVolume = totalVolume.add(volume);
      weightedSum = weightedSum.add(ad.rawRate.times(volume));
    }

    return totalVolume.isZero()
      ? new Decimal(0)
      : weightedSum.dividedBy(totalVolume);
  }

  /**
   * Calculates the median of a numeric array.
   * @private
   */
  private _calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Applies the configured inbound or outbound margin to the base rate.
   * @private
   */
  private async _applyMargin(
    baseRate: Decimal,
    adType: AdType,
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency
  ): Promise<Decimal> {
    try {
      const marginConfig = await this.pricingConfigService.getMargin(
        fiatCurrency,
        cryptoCurrency,
        adType
      );
      const margin = marginConfig.margin;
      let finalRate =
        adType === AdType.BUY
          ? baseRate.times(new Decimal(1).add(margin))
          : baseRate.times(new Decimal(1).minus(margin));

      const minMargin = marginConfig.minMargin;
      const maxMargin = marginConfig.maxMargin;

      if (minMargin !== undefined && minMargin !== null) {
        const minRateBound =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(minMargin))
            : baseRate.times(new Decimal(1).minus(minMargin));
        finalRate =
          adType === AdType.BUY
            ? Decimal.max(finalRate, minRateBound)
            : Decimal.min(finalRate, minRateBound);
      }

      if (maxMargin !== undefined && maxMargin !== null) {
        const maxRateBound =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(maxMargin))
            : baseRate.times(new Decimal(1).minus(maxMargin));
        finalRate =
          adType === AdType.BUY
            ? Decimal.min(finalRate, maxRateBound)
            : Decimal.max(finalRate, maxRateBound);
      }

      return finalRate;
    } catch (error) {
      this.log.error('Failed to apply dynamic margin, using static fallback', {
        error,
      });
      const staticMargin =
        adType === AdType.BUY ? MARGIN_CONFIG.INBOUND : MARGIN_CONFIG.OUTBOUND;
      return adType === AdType.BUY
        ? baseRate.times(new Decimal(1 + staticMargin))
        : baseRate.times(new Decimal(1 - staticMargin));
    }
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

const decimalCache = new DecimalAwareCacheService(p2pCacheService);
const pricingConfigService = new PricingConfigService(prisma);

export const rateService = new RateService(
  prisma,
  decimalCache,
  logger,
  pricingConfigService
);
