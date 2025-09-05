import axios from 'axios';
import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PrismaClient,
} from '@prisma/client';
import { logger } from '@/lib/logger';
import Decimal from 'decimal.js';
import { PAIRS_TO_FETCH, PAYMENT_METHODS_CONFIG } from '@/config';

// Define the Binance API URL
const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// Simplified interface for Binance API response
interface TradeMethod {
  tradeMethodName: string;
}

interface Adv {
  advNo: string;
  price: string;
  tradeMethods: TradeMethod[];
  tradableQuantity: string;
  minSingleTransAmount: string;
  maxSingleTransAmount: string;
}

interface BinanceP2PResponseData {
  adv: Adv;
}

interface BinanceP2PResponse {
  data?: BinanceP2PResponseData[];
}

// Simplified interface for processed ad data
export interface ProcessedAd {
  advNo: string;
  rawRate: Decimal;
  volumeAvailable: Decimal | null;
  minLimit: Decimal | null;
  maxLimit: Decimal | null;
}

/**
 * Service to handle Binance P2P ad fetching with focus on rate calculation
 */
export class BinanceP2PService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Fetches and stores Binance P2P ads for rate calculation
   */
  public async fetchAndStoreAdsForRates(): Promise<void> {
    logger.info('Starting Binance P2P ad fetch for rate calculation...');

    for (const pair of PAIRS_TO_FETCH) {
      await this.fetchAndStoreAdsForPair(pair.fiat, pair.crypto, pair.adType);
    }
    logger.info('Binance P2P ad fetch for rate calculation complete.');
  }

  /**
   * Fetches and stores ads for a specific currency pair
   */
  private async fetchAndStoreAdsForPair(
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType
  ): Promise<void> {
    try {
      const ads = await this.fetchBinanceP2PAds(fiatCurrency, adType);

      if (ads.length === 0) {
        logger.warn(`No ads found for ${fiatCurrency} ${adType}`);
        return;
      }

      await this.storeAdsForRateCalculation(
        ads,
        fiatCurrency,
        cryptoCurrency,
        adType
      );
      logger.info(
        `Processed ${ads.length} ads for ${fiatCurrency} ${cryptoCurrency} ${adType}`
      );
    } catch (error) {
      logger.error(
        `Error processing ads for ${fiatCurrency} ${adType}:`,
        error
      );
    }
  }

  /**
   * Fetches ads from the Binance P2P API
   */
  private async fetchBinanceP2PAds(
    fiat: FiatCurrency,
    tradeType: AdType,
    limit: number = 15,
    payTypes: string[] = []
  ): Promise<Adv[]> {
    try {
      const payload = {
        page: 1,
        rows: limit,
        asset: CryptoCurrency.USDT,
        fiat: fiat,
        tradeType: tradeType,
        ...(payTypes.length > 0 && { payTypes }),
      };

      const response = await axios.post<BinanceP2PResponse>(
        BINANCE_P2P_URL,
        payload,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      return response.data?.data?.map((item) => item.adv) || [];
    } catch (error) {
      logger.error('Error fetching Binance P2P ads:', error);
      if (axios.isAxiosError(error)) {
        logger.error('Binance API error details:', {
          status: error.response?.status,
          data: error.response?.data,
        });
      }
      return [];
    }
  }

  /**
   * Stores only the essential ad information needed for rate calculation
   */
  private async storeAdsForRateCalculation(
    ads: Adv[],
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency,
    adType: AdType
  ): Promise<void> {
    if (ads.length === 0) return;

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes expiry

      // Prepare only essential data for rate calculation
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
      await this.prisma.$transaction(async (tx) => {
        for (const data of adData) {
          await tx.binanceP2PAd.upsert({
            where: { advNo: data.advNo },
            update: data,
            create: data,
          });
        }
      });
    } catch (error) {
      logger.error('Error storing Binance ads for rate calculation:', error);
      // Don't throw to avoid breaking the entire process
    }
  }

  /**
   * Gets the latest Binance ads for rate calculation
   */
  public async getAdsForRateCalculation(
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
        orderBy: {
          fetchedAt: 'desc',
        },
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
      logger.error('Error fetching ads for rate calculation:', error);
      return [];
    }
  }

  /**
   * Calculates a volume-weighted average rate from ads
   */
  public calculateVolumeWeightedAverage(ads: ProcessedAd[]): Decimal {
    if (ads.length === 0) return new Decimal(0);

    let totalVolume = new Decimal(0);
    let weightedSum = new Decimal(0);

    for (const ad of ads) {
      const volume = ad.volumeAvailable || new Decimal(0);
      const rate = ad.rawRate;

      if (volume.isPositive() && rate.isPositive()) {
        totalVolume = totalVolume.add(volume);
        weightedSum = weightedSum.add(volume.times(rate));
      }
    }

    if (totalVolume.isZero()) {
      // Fallback to simple average if no volume data
      const rates = ads.map((ad) => ad.rawRate.toNumber());
      const sum = rates.reduce((a, b) => a + b, 0);
      return new Decimal(sum / rates.length);
    }

    return weightedSum.dividedBy(totalVolume);
  }

  /**
   * Cleans up expired Binance ads
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

      logger.info(`Cleaned up ${result.count} expired Binance ads`);
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired Binance ads:', error);
      return 0;
    }
  }
}

// Create a singleton instance
let binanceP2PServiceInstance: BinanceP2PService | null = null;

export function getBinanceP2PService(prisma: PrismaClient): BinanceP2PService {
  if (!binanceP2PServiceInstance) {
    binanceP2PServiceInstance = new BinanceP2PService(prisma);
  }
  return binanceP2PServiceInstance;
}
export const binanceService = getBinanceP2PService(prisma);
