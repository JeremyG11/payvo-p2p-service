import { logger } from '@/lib/logger';
import { BinanceP2PAdSynchronizer } from '@/services/rates/binance';

/**
 * BinanceSyncWorker is responsible for all interaction with the Binance
 * P2P Service, including fetching and storing new ads, and cleaning up
 * old, expired Binance P2P records.
 */
export class BinanceSyncWorker {
  constructor(private readonly binanceService: BinanceP2PAdSynchronizer) {}

  /**
   * Fetches and stores Binance ads using the BinanceService.
   */
  public async fetchBinanceAds(): Promise<void> {
    try {
      logger.debug('Starting Binance ads fetch');
      await this.binanceService.fetchAndStoreAdsForRates();
      logger.debug('Completed Binance ads fetch');
    } catch (error) {
      logger.error('Error in Binance ads fetch:', error);
      // Re-throwing allows the calling SchedulerService to handle fatal errors
      // and log status appropriately.
      throw error;
    }
  }

  /**
   * Cleans up expired Binance P2P ads (records stored internally).
   * This delegates to a method expected on the BinanceP2PService.
   */
  public async cleanupExpiredBinanceAds(): Promise<number> {
    try {
      logger.debug('Starting Binance ads cleanup');
      const count = await this.binanceService.cleanupExpiredAds();
      logger.info(`Cleaned up ${count} expired Binance ads`);
      return count;
    } catch (error) {
      logger.error('Error in Binance ads cleanup:', error);
      return 0;
    }
  }
}
