import { AdType, PrismaClient } from '@prisma/client';
import type { BinanceP2PAd } from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '@/lib/logger';
import { RateCalculator } from './rate-calculator';
import type { RateCalculationInput, RawAdRate } from '@/types/interface';

// Configuration for data fetching constraints
const DATA_FETCH_CONFIG = {
  DB_QUERY_RECENCY_MINUTES: 5,
  MAX_BINANCE_FETCH_ADS: 20, // Max number of ads to fetch for base rate calculation
};

/**
 * Custom error class for rate calculation failures (retained for external use).
 */
export class RateCalculationError extends Error {
  public context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RateCalculationError';
    this.context = context;
  }
}

/**
 * AdRateFetcher manages fetching raw ad data from primary (Binance) and
 * secondary (local DB) sources and determining the base market rate.
 */
export class AdRateFetcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly calculator: RateCalculator,
    private readonly log: typeof logger
  ) {}

  /**
   * Fetches relevant ads and calculates the volume-weighted base rate.
   * It prioritizes the recently synced Binance P2P data.
   *
   * @param input - The input parameters for the rate calculation.
   * @param topAdsConsidered - The number of top-filtered ads to use for the final average.
   * @returns The calculated base rate and the source used ('binance' or 'market').
   * @throws {RateCalculationError} If no valid ads are found.
   */
  public async getBaseRate(
    input: RateCalculationInput,
    topAdsConsidered: number
  ): Promise<{ baseRate: Decimal; source: 'binance' | 'market' }> {
    const context = { input };

    /**
     * Attempt Primary Source (Binance P2P Ad records)
     * If it fails (no ads, all filtered out, etc), log the error and
     * fall back to the secondary source (local DB ads).
     */
    try {
      const baseRate = await this._getRateFromBinance(input, topAdsConsidered);
      return { baseRate, source: 'binance' };
    } catch (binanceError) {
      this.log.warn('Failed to get Binance rate, falling back to database', {
        error:
          binanceError instanceof Error
            ? binanceError.message
            : String(binanceError),
        context,
      });

      /**
       * Fallback to Database-based calculation 
       * If this also fails, propagate the error up with context.
       */
      try {
        const baseRate = await this._getRateFromDatabase(input);
        return { baseRate, source: 'market' };
      } catch (dbError) {
        throw new RateCalculationError(
          `Failed to calculate rate from all sources.`,
          { ...context, primaryError: binanceError, secondaryError: dbError }
        );
      }
    }
  }

  /**
   * Gets the base rate from recently synced Binance P2P ads in the database.
   */
  private async _getRateFromBinance(
    input: RateCalculationInput,
    topN: number
  ): Promise<Decimal> {
    // Fetch a relevant number of recent ads
    const binanceAds = await this._fetchRelevantAdsFromDB(
      input,
      DATA_FETCH_CONFIG.MAX_BINANCE_FETCH_ADS
    );

    if (binanceAds.length === 0) {
      throw new RateCalculationError('No active Binance ads found', {
        ...input,
      });
    }

    const rawAds = this._mapToRawAdRate(binanceAds);

    // Filter out rate outliers
    const filteredAds = this.calculator.filterAdsByDeviation(rawAds);

    if (filteredAds.length === 0) {
      throw new RateCalculationError('All Binance ads filtered as outliers', {
        ...input,
        totalAds: binanceAds.length,
      });
    }

    // Use only the top N ads after filtering for the final average
    const topAds = filteredAds.slice(0, topN);
    const averageRate = this.calculator.calculateVolumeWeightedRate(topAds);

    this.log.info('Calculated base rate from Binance ads', {
      ...input,
      rate: averageRate.toString(),
      adsConsidered: topAds.length,
      totalAdsAvailable: binanceAds.length,
    });

    return averageRate;
  }

  /**
   * Fetches and calculates rate from local database ads (fallback).
   */
  private async _getRateFromDatabase(
    input: RateCalculationInput
  ): Promise<Decimal> {
    const ads = await this._fetchRelevantAdsFromDB(input, 20); // Limit to 20 for fallback calculation

    if (ads.length === 0) {
      throw new RateCalculationError(
        'No recent, high-volume ads found in database',
        { input }
      );
    }

    // Filter out rate outliers
    const validAds = this.calculator.filterAdsByDeviation(
      this._mapToRawAdRate(ads)
    );
    if (validAds.length === 0) {
      throw new RateCalculationError(
        'No ads remaining after deviation filtering in database',
        { input, adsCount: ads.length }
      );
    }

    const vwRate = this.calculator.calculateVolumeWeightedRate(validAds);

    return vwRate;
  }

  /**
   * Fetches a list of relevant, active, and recent Binance P2P ads from the database.
   */
  private async _fetchRelevantAdsFromDB(
    input: RateCalculationInput,
    take: number
  ): Promise<BinanceP2PAd[]> {
    return this.prisma.binanceP2PAd.findMany({
      where: {
        fiatCurrency: input.fiatCurrency,
        asset: input.cryptoCurrency,
        tradeType: input.adType,
        expiresAt: { gt: new Date() },
        fetchedAt: {
          // Only consider ads fetched recently
          gte: new Date(
            Date.now() - DATA_FETCH_CONFIG.DB_QUERY_RECENCY_MINUTES * 60 * 1000
          ),
        },
      },
      // Order by price: ASC for BUY (best rate is cheapest), DESC for SELL (best rate is highest)
      orderBy:
        input.adType === AdType.BUY ? { price: 'asc' } : { price: 'desc' },
      take: take,
    });
  }

  /**
   * Maps Prisma records to a standardized RawAdRate type.
   */
  private _mapToRawAdRate(ads: BinanceP2PAd[]): RawAdRate[] {
    return ads.map((ad) => ({
      rawRate: ad.price,
      volumeAvailable: ad.tradableQuantity || new Decimal(0),
      maxLimit: ad.maxSingleTransAmount,
      
    }));
  }
}
