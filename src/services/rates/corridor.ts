import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
  Source,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { redisCacheService } from '@/services/cache/rate';
import { ICacheService } from '@/types/cache';
import { DecimalAwareCacheService } from '../cache/rate/decimal-aware-cache';
import { PricingConfigService } from '../cache/rate/pricing';
import { config } from '@/config/env';

const MARGIN_CONFIG = {
  INBOUND: validateMargin(0.01, process.env.INBOUND_MARGIN),
  OUTBOUND: validateMargin(0.01, process.env.OUTBOUND_MARGIN),
  MIN_VOLUME_THRESHOLD: 1000,
  MAX_RATE_DEVIATION: 0.05,
  CACHE_TTL_SECONDS: 300,
  DB_QUERY_RECENCY_MINUTES: 5,
};

/**
 * Validates and parses a margin value.
 * @param defaultValue The default value to use if the margin is invalid.
 * @param margin The margin value to validate.
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

interface RateCalculationInput {
  fiatCurrency: FiatCurrency;
  cryptoCurrency: CryptoCurrency;
  adType: AdType;
}

interface ICalculatedRate {
  rate: Decimal;
  source: 'binance' | 'market' | 'fallback';
  sourceDetail?: string;
  calculatedAt: Date;
  adsConsidered: number;
  volumeWeight: Decimal;
  stale?: boolean;
  baseRate?: Decimal;
  marginApplied?: Decimal;
}

interface ICorridorRate {
  fromCurrency: FiatCurrency;
  toCurrency: FiatCurrency;
  rate: Decimal;
  inboundRate: ICalculatedRate;
  outboundRate: ICalculatedRate;
  margin: Decimal;
  expiresAt: Date;
  stale?: boolean;
  calculationMethod?: string;
}

type RawAdRate = {
  rawRate: Decimal;
  volumeAvailable: Decimal;
  maxLimit: Decimal | null;
};

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
   * @param prisma - Prisma client for database access.
   * @param cache - Cache service for storing and retrieving rates.
   * @param log - Logger service for logging messages.
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
   * @param fromCurrency - The source fiat currency.
   * @param toCurrency - The target fiat currency.
   * @returns A promise resolving to the raw corridor rate object before caching.
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

    // The correct calculation is division, not multiplication.
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
   * @private
   * @param input - The input parameters for the rate calculation.
   * @returns A promise resolving to the raw calculated rate object before caching.
   * @throws {RateCalculationError} If no valid ads are found at any stage.
   */
  // Update the _fetchAndCalculateMarketRate method
  private async _fetchAndCalculateMarketRate(
    input: RateCalculationInput
  ): Promise<ICalculatedRate> {
    try {
      const topAdsConsidered = Number(config.rates.topAdsConsidered);
      const baseRate = await this._getBaseRate(
        input.fiatCurrency,
        input.cryptoCurrency,
        input.adType,
        topAdsConsidered
      );

      // Apply margin using dynamic pricing config
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
        adsConsidered: Number(config.rates.topAdsConsidered),
        volumeWeight: new Decimal(0), // Not tracking volume weight for Binance ads
      };
    } catch (error) {
      this.log.warn('Falling back to database ads for rate calculation', {
        error: error.message,
        input,
      });

      // Fallback to the original database-based calculation
      const ads = await this._fetchRelevantAds(input);
      if (ads.length === 0) {
        throw new RateCalculationError('No recent, high-volume ads found', {
          input,
        });
      }

      const validAds = this._filterAdsByDeviation(ads);
      if (validAds.length === 0) {
        throw new RateCalculationError(
          'No ads remaining after deviation filtering',
          { input, adsCount: ads.length }
        );
      }

      const { vwRate, totalVolume } =
        this._calculateVolumeWeightedRate(validAds);
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
        volumeWeight: totalVolume,
      };
    }
  }

  /**
   * Fetches a list of relevant, active, and recent P2P ads from the database.
   * @private
   * @param input - The input parameters (fiat, crypto, ad type).
   * @returns A promise that resolves to an array of raw ad data.
   */
  private async _fetchRelevantAds(
    input: RateCalculationInput
  ): Promise<RawAdRate[]> {
    return this.prisma.fiatCryptoRate.findMany({
      where: {
        fiatCurrency: input.fiatCurrency,
        cryptoCurrency: input.cryptoCurrency,
        adType: input.adType,
        isActive: true,
        volumeAvailable: {
          gte: new Decimal(MARGIN_CONFIG.MIN_VOLUME_THRESHOLD),
        },
        updatedAt: {
          gte: new Date(
            Date.now() - MARGIN_CONFIG.DB_QUERY_RECENCY_MINUTES * 60 * 1000
          ),
        },
      },
      orderBy:
        input.adType === AdType.BUY ? { rawRate: 'asc' } : { rawRate: 'desc' },
      select: { rawRate: true, volumeAvailable: true, maxLimit: true },
    });
  }

  /**
   * Filters a list of ads, removing those whose rates deviate significantly from the median.
   * @private
   * @param ads - The array of raw ad data.
   * @returns A new array containing only the valid ads.
   */
  private _filterAdsByDeviation(ads: RawAdRate[]): RawAdRate[] {
    if (ads.length === 0) return [];

    // Optimization: map to numbers once to avoid repeated conversions.
    const adsWithNumbers = ads.map((ad) => ({
      ...ad,
      rateNum: ad.rawRate.toNumber(),
    }));
    const median = this._calculateMedian(adsWithNumbers.map((a) => a.rateNum));

    return adsWithNumbers.filter((ad) => {
      const deviation = Math.abs(ad.rateNum - median) / median;
      return deviation <= MARGIN_CONFIG.MAX_RATE_DEVIATION;
    });
  }

  /**
   * Calculates the volume-weighted average rate from a list of ads.
   * @private
   * @param ads - The array of valid ad data.
   * @returns An object containing the volume-weighted rate and total volume.
   */
  private _calculateVolumeWeightedRate(ads: RawAdRate[]): {
    vwRate: Decimal;
    totalVolume: Decimal;
  } {
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

    const vwRate = totalVolume.isZero()
      ? new Decimal(0)
      : weightedSum.dividedBy(totalVolume);
    return { vwRate, totalVolume };
  }

  /**
   * Calculates the median of a numeric array.
   * @private
   * @param values - An array of numbers.
   * @returns The median value, or 0 if the array is empty.
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
   * @param rate - The base rate to apply the margin to.
   * @param adType - The type of ad (BUY or SELL) to determine which margin to use.
   * @returns The final rate with the margin applied.
   */
  // Replace the _applyMargin method
  private async _applyMargin(
    baseRate: Decimal,
    adType: AdType,
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency
  ): Promise<Decimal> {
    try {
      // Get margin configuration from database
      const marginConfig = await this.pricingConfigService.getMargin(
        fiatCurrency,
        cryptoCurrency,
        adType
      );

      // Apply margin with bounds checking
      let marginRate =
        adType === AdType.BUY
          ? baseRate.times(new Decimal(1).add(marginConfig.margin))
          : baseRate.times(new Decimal(1).minus(marginConfig.margin));

      // Apply minimum margin bound if specified
      if (marginConfig.minMargin) {
        const minRate =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(marginConfig.minMargin))
            : baseRate.times(new Decimal(1).minus(marginConfig.minMargin));

        marginRate =
          adType === AdType.BUY
            ? Decimal.max(marginRate, minRate)
            : Decimal.min(marginRate, minRate);
      }

      // Apply maximum margin bound if specified
      if (marginConfig.maxMargin) {
        const maxRate =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(marginConfig.maxMargin))
            : baseRate.times(new Decimal(1).minus(marginConfig.maxMargin));

        marginRate =
          adType === AdType.BUY
            ? Decimal.min(marginRate, maxRate)
            : Decimal.max(marginRate, maxRate);
      }

      return marginRate;
    } catch (error) {
      this.log.error(
        'Failed to apply dynamic margin, using static fallback',
        error
      );

      // Fallback to static margin if dynamic config fails
      return adType === AdType.BUY
        ? baseRate.times(new Decimal(1 + MARGIN_CONFIG.INBOUND))
        : baseRate.times(new Decimal(1 - MARGIN_CONFIG.OUTBOUND));
    }
  }

  // --- Caching Abstraction (Refactored) ---

  /**
   * A generic utility method to handle get-or-calculate-and-cache logic.
   * It first attempts to retrieve data from the cache. If not found, it runs the
   * calculation function, caches the result, and returns it. It also has a
   * stale-if-error fallback mechanism.
   * @private
   * @template T - The type of the value being cached.
   * @param options - An object containing the cache key, TTL, calculation function, and parsing function.
   * @returns A promise that resolves to the cached or newly calculated value.
   * @throws {Error} If both cache and calculation fail.
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

  /**
   * Gets the base rate from Binance P2P ads by averaging top N valid ads
   */
  private async _getBaseRate(
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType,
    topN: number = Number(config.rates.topAdsConsidered)
  ): Promise<Decimal> {
    try {
      // Fetch recent Binance ads with sufficient volume
      const binanceAds = await this.prisma.fiatCryptoRate.findMany({
        where: {
          source: Source.BINANCE,
          fiatCurrency,
          cryptoCurrency,
          adType,
          isActive: true,
          volumeAvailable: {
            gte: new Decimal(MARGIN_CONFIG.MIN_VOLUME_THRESHOLD),
          },
          updatedAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
          },
        },
        orderBy:
          adType === AdType.BUY
            ? { rawRate: 'asc' } // For BUY, lower rate is better
            : { rawRate: 'desc' }, // For SELL, higher rate is better
        take: 20, // Get more than needed to filter outliers
      });

      if (binanceAds.length === 0) {
        throw new RateCalculationError('No active Binance ads found', {
          fiatCurrency,
          cryptoCurrency,
          adType,
        });
      }

      // Filter outliers using median absolute deviation
      const filteredAds = this._filterAdsByDeviation(binanceAds);

      if (filteredAds.length === 0) {
        throw new RateCalculationError('All Binance ads filtered as outliers', {
          fiatCurrency,
          cryptoCurrency,
          adType,
          totalAds: binanceAds.length,
        });
      }

      // Take top N ads and calculate average
      const topAds = filteredAds.slice(0, topN);
      const averageRate = this._calculateAverageRate(topAds);

      this.log.info('Calculated base rate from Binance ads', {
        fiatCurrency,
        cryptoCurrency,
        adType,
        rate: averageRate.toString(),
        adsConsidered: topAds.length,
        totalAdsAvailable: binanceAds.length,
      });

      return averageRate;
    } catch (error) {
      this.log.error('Failed to calculate base rate from Binance', error);
      throw error;
    }
  }

  /**
   * Calculate average rate from ads (volume-weighted)
   */
  private _calculateAverageRate(ads: RawAdRate[]): Decimal {
    if (ads.length === 0) return new Decimal(0);
    if (ads.length === 1) return ads[0].rawRate;

    let totalVolume = new Decimal(0);
    let weightedSum = new Decimal(0);

    ads.forEach((ad) => {
      const volume = Decimal.min(
        ad.volumeAvailable,
        ad.maxLimit || ad.volumeAvailable
      );
      totalVolume = totalVolume.add(volume);
      weightedSum = weightedSum.add(ad.rawRate.times(volume));
    });

    return totalVolume.isZero()
      ? ads[0].rawRate // Fallback to simple average if no volume
      : weightedSum.dividedBy(totalVolume);
  }
}

const decimalCache = new DecimalAwareCacheService(redisCacheService);
const pricingConfigService = new PricingConfigService(prisma);

export const rateService = new RateService(
  prisma,
  decimalCache,
  logger,
  pricingConfigService
);
