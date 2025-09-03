import cron, { ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { AdStatus } from '@prisma/client';
import { fetchAndStoreAllBinanceRates } from './rates';

export class RateCleanupService {
  private cleanupTask: ScheduledTask | null = null;
  private binanceFetchTask: ScheduledTask | null = null;
  private isCleanupRunning: boolean = false;
  private isBinanceFetchRunning: boolean = false;

  constructor() {}

  /**
   * Clean up expired rates and update associated ads to INACTIVE status
   */
  public async cleanupExpiredRates(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    try {
      const expiredRates = await prisma.fiatCryptoRate.findMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
          isActive: true, // Only consider active rates
        },
        select: {
          id: true,
        },
      });

      const expiredRateIds = expiredRates.map((rate) => rate.id);

      if (expiredRateIds.length === 0) {
        logger.info('No expired rates to clean up');
        return { updatedAdsCount: 0, deletedRatesCount: 0 };
      }

      // Update ads linked to expired rates to INACTIVE status
      const updatedAdsCountResult = await prisma.ad.updateMany({
        where: {
          fiatCryptoRateId: {
            in: expiredRateIds,
          },
          status: {
            not: AdStatus.INACTIVE,
          },
        },
        data: {
          status: AdStatus.INACTIVE,
          updatedAt: new Date(),
        },
      });

      logger.info(
        `Updated ${updatedAdsCountResult.count} ads to INACTIVE status`
      );

      // Delete the expired rates
      const deletedRatesCountResult = await prisma.fiatCryptoRate.deleteMany({
        where: {
          id: {
            in: expiredRateIds,
          },
        },
      });

      logger.info(`Cleaned up ${deletedRatesCountResult.count} expired rates`);

      return {
        updatedAdsCount: updatedAdsCountResult.count,
        deletedRatesCount: deletedRatesCountResult.count,
      };
    } catch (error) {
      logger.error('Error cleaning up expired rates:', error);
      return { updatedAdsCount: 0, deletedRatesCount: 0 };
    }
  }

  /**
   * Fetch Binance rates
   */
  private async fetchBinanceRates(): Promise<void> {
    if (this.isBinanceFetchRunning) {
      logger.debug('Binance rate fetch already in progress, skipping');
      return;
    }

    this.isBinanceFetchRunning = true;
    try {
      logger.debug('Starting Binance rate fetch');
      await fetchAndStoreAllBinanceRates();
      logger.debug('Completed Binance rate fetch');
    } catch (error) {
      logger.error('Error in Binance rate fetch:', error);
    } finally {
      this.isBinanceFetchRunning = false;
    }
  }

  /**
   * Schedule both rate cleanup and Binance rate fetch tasks
   */
  public scheduleAllTasks(): void {
    // Schedule rate cleanup every 5 minutes
    this.scheduleRateCleanup('*/5 * * * *');

    // Schedule Binance rate fetch every 2 minutes
    this.scheduleBinanceRateFetch('*/2 * * * *');
  }

  /**
   * Schedule the rate cleanup task
   */
  public scheduleRateCleanup(
    cronExpression: string = '*/5 * * * *'
  ): ScheduledTask {
    if (this.cleanupTask) {
      this.stopRateCleanup();
    }

    this.cleanupTask = cron.schedule(
      cronExpression,
      async () => {
        if (this.isCleanupRunning) {
          logger.debug('Rate cleanup already in progress, skipping');
          return;
        }

        this.isCleanupRunning = true;
        try {
          logger.debug('Starting scheduled rate cleanup');
          await this.cleanupExpiredRates();
          logger.debug('Completed scheduled rate cleanup');
        } catch (error) {
          logger.error('Error in scheduled rate cleanup:', error);
        } finally {
          this.isCleanupRunning = false;
        }
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info(`Rate cleanup scheduled with expression: ${cronExpression}`);
    return this.cleanupTask;
  }

  /**
   * Schedule the Binance rate fetch task
   */
  public scheduleBinanceRateFetch(
    cronExpression: string = '*/2 * * * *'
  ): ScheduledTask {
    if (this.binanceFetchTask) {
      this.stopBinanceRateFetch();
    }

    this.binanceFetchTask = cron.schedule(
      cronExpression,
      async () => {
        await this.fetchBinanceRates();
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info(
      `Binance rate fetch scheduled with expression: ${cronExpression}`
    );
    return this.binanceFetchTask;
  }

  /**
   * Stop the rate cleanup task
   */
  public stopRateCleanup(): void {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      logger.info('Rate cleanup task stopped');
    }
  }

  /**
   * Stop the Binance rate fetch task
   */
  public stopBinanceRateFetch(): void {
    if (this.binanceFetchTask) {
      this.binanceFetchTask.stop();
      this.binanceFetchTask = null;
      logger.info('Binance rate fetch task stopped');
    }
  }

  /**
   * Stop all scheduled tasks
   */
  public stopAllTasks(): void {
    this.stopRateCleanup();
    this.stopBinanceRateFetch();
  }

  /**
   * Check if the cleanup task is running
   */
  public getIsCleanupRunning(): boolean {
    return this.isCleanupRunning;
  }

  /**
   * Check if the Binance fetch task is running
   */
  public getIsBinanceFetchRunning(): boolean {
    return this.isBinanceFetchRunning;
  }

  /**
   * Manual trigger for cleanup (useful for testing or admin operations)
   */
  public async manualCleanup(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    logger.info('Manual rate cleanup triggered');
    return this.cleanupExpiredRates();
  }

  /**
   * Manual trigger for Binance rate fetch
   */
  public async manualBinanceFetch(): Promise<void> {
    logger.info('Manual Binance rate fetch triggered');
    return this.fetchBinanceRates();
  }
}

// Create and export a singleton instance
let rateCleanupServiceInstance: RateCleanupService | null = null;

export function getRateCleanupService(): RateCleanupService {
  if (!rateCleanupServiceInstance) {
    rateCleanupServiceInstance = new RateCleanupService();
  }
  return rateCleanupServiceInstance;
}

export const rateCleanupService = getRateCleanupService();
