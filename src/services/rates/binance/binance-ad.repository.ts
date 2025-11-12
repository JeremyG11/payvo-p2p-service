import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '@/lib/logger';
import type { RawBinanceAdv } from './binance-api.client';

// Simplified interface for processed ad data, used for retrieval
export interface ProcessedAd {
  advNo: string;
  rawRate: Decimal;
  volumeAvailable: Decimal | null;
  minLimit: Decimal | null;
  maxLimit: Decimal | null;
}

/**
 * BinanceP2PAdRepository manages all interactions with the internal database
 * related to the BinanceP2PAd model, including storage, retrieval, and cleanup.
 */
export class BinanceP2PAdRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Stores or updates the essential ad information needed for rate calculation.
   * This logic handles data conversion from RawBinanceAdv to the BinanceP2PAd Prisma model.
   */
  public async storeAds(
    ads: RawBinanceAdv[],
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType
  ): Promise<number> {
    if (ads.length === 0) return 0;

    try {
      const now = new Date();
      // Ads expire after 5 minutes, ensuring data is relatively fresh
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      // Prepare data for upsert
      const adData = ads.map((ad) => ({
        advNo: ad.advNo,
        tradeType: adType,
        asset: cryptoCurrency,
        fiatCurrency: fiatCurrency,
        price: new Decimal(ad.price),
        tradableQuantity: ad.tradableQuantity
          ? new Decimal(ad.tradableQuantity)
          : new Decimal(0),
        minSingleTransAmount: ad.minSingleTransAmount
          ? new Decimal(ad.minSingleTransAmount)
          : new Decimal(0),
        maxSingleTransAmount: ad.maxSingleTransAmount
          ? new Decimal(ad.maxSingleTransAmount)
          : new Decimal(0),
        fetchedAt: now,
        expiresAt: expiresAt,
      }));

      // Use transaction for bulk upsert
      const results = await this.prisma.$transaction(async (tx) => {
        let upsertCount = 0;
        for (const data of adData) {
          await tx.binanceP2PAd.upsert({
            where: { advNo: data.advNo },
            update: data,
            create: data,
          });
          upsertCount++;
        }
        return upsertCount;
      });

      return results;
    } catch (error) {
      logger.error('Error storing Binance ads for rate calculation:', error);
      return 0;
    }
  }

  /**
   * Gets the latest, unexpired Binance ads from the database for rate calculation.
   */
  public async getAds(
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType,
    limit: number = 20
  ): Promise<ProcessedAd[]> {
    try {
      const ads = await this.prisma.binanceP2PAd.findMany({
        where: {
          fiatCurrency,
          asset: cryptoCurrency,
          tradeType: adType,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: adType === AdType.BUY ? { price: 'asc' } : { price: 'desc' },
        take: limit,
      });

      // Convert to ProcessedAd format
      return ads.map((ad) => ({
        advNo: ad.advNo,
        rawRate: ad.price,
        volumeAvailable: ad.tradableQuantity,
        minLimit: ad.minSingleTransAmount,
        maxLimit: ad.maxSingleTransAmount,
      }));
    } catch (error) {
      logger.error(
        'Error fetching ads for rate calculation from repository:',
        error
      );
      return [];
    }
  }

  /**
   * Cleans up expired Binance ads from the database.
   */
  public async cleanupExpiredAds(): Promise<number> {
    try {
      const result = await this.prisma.binanceP2PAd.deleteMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
        },
      });

      logger.info(
        `Cleaned up ${result.count} expired Binance ads from repository`
      );
      return result.count;
    } catch (error) {
      logger.error(
        'Error cleaning up expired Binance ads in repository:',
        error
      );
      return 0;
    }
  }
}
