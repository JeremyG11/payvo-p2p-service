import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
} from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PAIRS_TO_FETCH } from '@/config';
import { BinanceAPIClient } from './binance-api.client';
import {
  BinanceP2PAdRepository,
  type ProcessedAd,
} from './binance-ad.repository';

/**
 * BinanceP2PAdSynchronizer orchestrates the process of fetching ads from the
 * external API and persisting them in the database for rate calculation.
 * This class now delegates all core fetching and persistence tasks.
 */
export class BinanceP2PAdSynchronizer {
  private readonly apiClient: BinanceAPIClient;
  private readonly repository: BinanceP2PAdRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.apiClient = new BinanceAPIClient(logger);
    this.repository = new BinanceP2PAdRepository(prisma);
  }

  /**
   * Fetches and stores Binance P2P ads for all configured pairs for rate calculation.
   */
  public async fetchAndStoreAdsForRates(): Promise<void> {
    logger.info(
      'Starting Binance P2P ad synchronization for rate calculation...'
    );

    for (const pair of PAIRS_TO_FETCH) {
      await this.fetchAndStoreAdsForPair(pair.fiat, pair.crypto, pair.adType);
    }
    logger.info('Binance P2P ad synchronization complete.');
  }

  /**
   * Fetches and stores ads for a specific currency pair by delegating to workers.
   */
  private async fetchAndStoreAdsForPair(
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType
  ): Promise<void> {
    try {
      const ads = await this.apiClient.fetchBinanceP2PAds(
        fiatCurrency,
        adType,
        20
      );

      if (ads.length === 0) {
        logger.warn(`No ads found by API for ${fiatCurrency} ${adType}`);
        return;
      }

      // 2. Store data in the database (delegated to Repository)
      const storedCount = await this.repository.storeAds(
        ads,
        fiatCurrency,
        cryptoCurrency,
        adType
      );

      logger.info(
        `Synchronized ${storedCount} ads for ${fiatCurrency} ${cryptoCurrency} ${adType}`
      );
    } catch (error) {
      logger.error(
        `Error synchronizing ads for ${fiatCurrency} ${adType}:`,
        error
      );
    }
  }

  /**
   * Exposes the repository's cleanup method for use by the SchedulerService.
   */
  public async cleanupExpiredAds(): Promise<number> {
    return this.repository.cleanupExpiredAds();
  }

  /**
   * Exposes the repository's retrieval method for direct use by other services.
   */
  public async getAdsForRateCalculation(
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType,
    limit: number = 20
  ): Promise<ProcessedAd[]> {
    return this.repository.getAds(fiatCurrency, cryptoCurrency, adType, limit);
  }
}

// Create a singleton instance
let binanceP2PServiceInstance: BinanceP2PAdSynchronizer | null = null;

export function getBinanceP2PService(
  prisma: PrismaClient
): BinanceP2PAdSynchronizer {
  if (!binanceP2PServiceInstance) {
    binanceP2PServiceInstance = new BinanceP2PAdSynchronizer(prisma);
  }
  return binanceP2PServiceInstance;
}

export const binanceService = getBinanceP2PService(prisma);
