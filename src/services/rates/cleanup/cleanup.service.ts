import cron, { ScheduledTask } from 'node-cron';
import { AdStatus, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { BinanceP2PService, binanceService } from '@/services/rates/binance';

/**
 * A singleton service for managing cron jobs and data cleanup.
 */
export class CleanupService {
  private cleanupTask: ScheduledTask | null = null;
  private binanceFetchTask: ScheduledTask | null = null;
  private binanceCleanupTask: ScheduledTask | null = null;
  private isCleanupRunning: boolean = false;
  private isBinanceFetchRunning: boolean = false;
  private isBinanceCleanupRunning: boolean = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly binanceService: BinanceP2PService
  ) {
    this.prisma = prisma;
    this.binanceService = binanceService;
  }

  /**
   * Cleans up expired rates and updates associated ads to INACTIVE status.
   */
  public async cleanupExpiredRates(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    if (this.isCleanupRunning) {
      logger.debug('Rate cleanup already in progress, skipping');
      return { updatedAdsCount: 0, deletedRatesCount: 0 };
    }

    this.isCleanupRunning = true;
    try {
      logger.debug('Starting scheduled rate cleanup');
      const expiredRates = await this.prisma.binanceP2PAd.findMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
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

      const updatedAdsCountResult = await this.prisma.ad.updateMany({
        where: {
          id: {
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

      const deletedRatesCountResult = await this.prisma.binanceP2PAd.deleteMany(
        {
          where: {
            id: {
              in: expiredRateIds,
            },
          },
        }
      );

      logger.info(`Cleaned up ${deletedRatesCountResult.count} expired rates`);

      return {
        updatedAdsCount: updatedAdsCountResult.count,
        deletedRatesCount: deletedRatesCountResult.count,
      };
    } catch (error) {
      logger.error('Error in scheduled rate cleanup:', error);
      return { updatedAdsCount: 0, deletedRatesCount: 0 };
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * Cleans up expired Binance P2P ads
   */
  public async cleanupExpiredBinanceAds(): Promise<number> {
    if (this.isBinanceCleanupRunning) {
      logger.debug('Binance ads cleanup already in progress, skipping');
      return 0;
    }

    this.isBinanceCleanupRunning = true;
    try {
      logger.debug('Starting Binance ads cleanup');
      const count = await this.binanceService.cleanupExpiredAds();
      logger.info(`Cleaned up ${count} expired Binance ads`);
      return count;
    } catch (error) {
      logger.error('Error in Binance ads cleanup:', error);
      return 0;
    } finally {
      this.isBinanceCleanupRunning = false;
    }
  }

  /**
   * Fetches and stores Binance ads using the BinanceService.
   */
  public async fetchBinanceAds(): Promise<void> {
    if (this.isBinanceFetchRunning) {
      logger.debug('Binance ads fetch already in progress, skipping');
      return;
    }
    this.isBinanceFetchRunning = true;
    try {
      logger.debug('Starting Binance ads fetch');
      await this.binanceService.fetchAndStoreAdsForRates();
      logger.debug('Completed Binance ads fetch');
    } catch (error) {
      logger.error('Error in Binance ads fetch:', error);
    } finally {
      this.isBinanceFetchRunning = false;
    }
  }

  /**
   * Schedules all cleanup and fetch tasks.
   */
  public scheduleAllTasks(): void {
    this.scheduleRateCleanup('*/5 * * * *'); // Every 5 minutes
    this.scheduleBinanceAdsFetch('*/2 * * * *'); // Every 2 minutes
    this.scheduleBinanceAdsCleanup('0 * * * *'); // Every hour
  }

  /**
   * Schedules the rate cleanup task using a cron expression.
   */
  public scheduleRateCleanup(cronExpression: string): ScheduledTask {
    if (this.cleanupTask) {
      this.stopRateCleanup();
    }
    this.cleanupTask = cron.schedule(
      cronExpression,
      async () => {
        await this.cleanupExpiredRates();
      },
      { timezone: 'UTC' }
    );
    logger.info(`Rate cleanup scheduled with expression: ${cronExpression}`);
    return this.cleanupTask;
  }

  /**
   * Schedules the Binance ads fetch task using a cron expression.
   */
  public scheduleBinanceAdsFetch(cronExpression: string): ScheduledTask {
    if (this.binanceFetchTask) {
      this.stopBinanceAdsFetch();
    }
    this.binanceFetchTask = cron.schedule(
      cronExpression,
      async () => {
        await this.fetchBinanceAds();
      },
      { timezone: 'UTC' }
    );
    logger.info(
      `Binance ads fetch scheduled with expression: ${cronExpression}`
    );
    return this.binanceFetchTask;
  }

  /**
   * Schedules the Binance ads cleanup task using a cron expression.
   */
  public scheduleBinanceAdsCleanup(cronExpression: string): ScheduledTask {
    if (this.binanceCleanupTask) {
      this.stopBinanceAdsCleanup();
    }
    this.binanceCleanupTask = cron.schedule(
      cronExpression,
      async () => {
        await this.cleanupExpiredBinanceAds();
      },
      { timezone: 'UTC' }
    );
    logger.info(
      `Binance ads cleanup scheduled with expression: ${cronExpression}`
    );
    return this.binanceCleanupTask;
  }

  /**
   * Stops the rate cleanup task.
   */
  public stopRateCleanup(): void {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      logger.info('Rate cleanup task stopped');
    }
  }

  /**
   * Stops the Binance ads fetch task.
   */
  public stopBinanceAdsFetch(): void {
    if (this.binanceFetchTask) {
      this.binanceFetchTask.stop();
      this.binanceFetchTask = null;
      logger.info('Binance ads fetch task stopped');
    }
  }

  /**
   * Stops the Binance ads cleanup task.
   */
  public stopBinanceAdsCleanup(): void {
    if (this.binanceCleanupTask) {
      this.binanceCleanupTask.stop();
      this.binanceCleanupTask = null;
      logger.info('Binance ads cleanup task stopped');
    }
  }

  /**
   * Stops all scheduled tasks.
   */
  public stopAllTasks(): void {
    this.stopRateCleanup();
    this.stopBinanceAdsFetch();
    this.stopBinanceAdsCleanup();
  }

  /**
   * Checks if the cleanup task is currently running.
   */
  public getIsCleanupRunning(): boolean {
    return this.isCleanupRunning;
  }

  /**
   * Checks if the Binance fetch task is currently running.
   */
  public getIsBinanceFetchRunning(): boolean {
    return this.isBinanceFetchRunning;
  }

  /**
   * Checks if the Binance cleanup task is currently running.
   */
  public getIsBinanceCleanupRunning(): boolean {
    return this.isBinanceCleanupRunning;
  }

  /**
   * Manually triggers the rate cleanup process.
   */
  public async manualCleanup(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    logger.info('Manual rate cleanup triggered');
    return this.cleanupExpiredRates();
  }

  /**
   * Manually triggers the Binance ads fetch process.
   */
  public async manualBinanceFetch(): Promise<void> {
    logger.info('Manual Binance ads fetch triggered');
    return this.fetchBinanceAds();
  }

  /**
   * Manually triggers the Binance ads cleanup process.
   */
  public async manualBinanceCleanup(): Promise<number> {
    logger.info('Manual Binance ads cleanup triggered');
    return this.cleanupExpiredBinanceAds();
  }
}

// A singleton instance of the CleanupService
let cleanupServiceInstance: CleanupService | null = null;

/**
 * Returns a singleton instance of the CleanupService.
 */
export function getCleanupService(
  prisma: PrismaClient,
  binanceService: BinanceP2PService
): CleanupService {
  if (!cleanupServiceInstance) {
    cleanupServiceInstance = new CleanupService(prisma, binanceService);
  }
  return cleanupServiceInstance;
}

export const cleanupService = getCleanupService(prisma, binanceService);
