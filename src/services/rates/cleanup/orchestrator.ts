import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { PrismaClient } from '@prisma/client';
import cron, { type ScheduledTask } from 'node-cron';
import {
  BinanceP2PAdSynchronizer,
  binanceService,
} from '@/services/rates/binance';
import { RateCleanupWorker } from '@/services/rates/cleanup/rate-cleanup-worker';
import { BinanceSyncWorker } from '@/services/rates/cleanup/binance-sync-worker';

/**
 * The SchedulerService is the orchestrator for all recurring background tasks.
 * It manages cron job scheduling, execution status, and delegates the actual
 * work (cleanup and syncing) to specialized worker classes.
 */
export class SchedulerService {
  private rateCleanupTask: ScheduledTask | null = null;
  private binanceFetchTask: ScheduledTask | null = null;
  private binanceCleanupTask: ScheduledTask | null = null;

  // Status flags for concurrency control (per task type)
  private isRateCleanupRunning: boolean = false;
  private isBinanceFetchRunning: boolean = false;
  private isBinanceCleanupRunning: boolean = false;

  private rateCleanupWorker: RateCleanupWorker;
  private binanceSyncWorker: BinanceSyncWorker;

  constructor(prisma: PrismaClient, binanceService: BinanceP2PAdSynchronizer) {
    // Instantiate the dedicated worker classes
    this.rateCleanupWorker = new RateCleanupWorker(prisma);
    this.binanceSyncWorker = new BinanceSyncWorker(binanceService);
  }

  /**
   * Executes the Rate Cleanup task, preventing concurrent runs.
   */
  private async executeRateCleanup(): Promise<void> {
    if (this.isRateCleanupRunning) {
      logger.debug('Rate cleanup already in progress, skipping');
      return;
    }
    this.isRateCleanupRunning = true;
    try {
      // Delegate to the specialized worker
      await this.rateCleanupWorker.cleanupExpiredRates();
    } catch (error) {
      logger.error('Fatal error executing Rate Cleanup Worker:', error);
    } finally {
      this.isRateCleanupRunning = false;
    }
  }

  /**
   * Executes the Binance Ad Fetch task, preventing concurrent runs.
   */
  private async executeBinanceFetch(): Promise<void> {
    if (this.isBinanceFetchRunning) {
      logger.debug('Binance ads fetch already in progress, skipping');
      return;
    }
    this.isBinanceFetchRunning = true;
    try {
      // Delegate to the specialized worker
      await this.binanceSyncWorker.fetchBinanceAds();
    } catch (error) {
      logger.error('Fatal error executing Binance Fetch Worker:', error);
    } finally {
      this.isBinanceFetchRunning = false;
    }
  }

  /**
   * Executes the Binance Ad Cleanup task, preventing concurrent runs.
   */
  private async executeBinanceCleanup(): Promise<void> {
    if (this.isBinanceCleanupRunning) {
      logger.debug('Binance ads cleanup already in progress, skipping');
      return;
    }
    this.isBinanceCleanupRunning = true;
    try {
      // Delegate to the specialized worker
      await this.binanceSyncWorker.cleanupExpiredBinanceAds();
    } catch (error) {
      logger.error('Fatal error executing Binance Cleanup Worker:', error);
    } finally {
      this.isBinanceCleanupRunning = false;
    }
  }

  /**
   * Schedules all cleanup and fetch tasks with default cron expressions.
   */
  public scheduleAllTasks(): void {
    this.scheduleRateCleanup('*/15 * * * *'); // Every 5 minutes
    this.scheduleBinanceAdsFetch('*/12 * * * *'); // Every 2 minutes
    this.scheduleBinanceAdsCleanup('0 * * * *'); // Every hour
    logger.info('All scheduler tasks initialized and started.');
  }

  /**
   * Schedules the rate cleanup task using a cron expression.
   */
  public scheduleRateCleanup(cronExpression: string): ScheduledTask {
    if (this.rateCleanupTask) {
      this.stopRateCleanup();
    }
    this.rateCleanupTask = cron.schedule(
      cronExpression,
      () => this.executeRateCleanup(),
      { timezone: 'UTC' }
    );
    logger.info(`Rate cleanup scheduled with expression: ${cronExpression}`);
    return this.rateCleanupTask;
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
      () => this.executeBinanceFetch(),
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
      () => this.executeBinanceCleanup(),
      { timezone: 'UTC' }
    );
    logger.info(
      `Binance ads cleanup scheduled with expression: ${cronExpression}`
    );
    return this.binanceCleanupTask;
  }

  public stopRateCleanup(): void {
    if (this.rateCleanupTask) {
      this.rateCleanupTask.stop();
      this.rateCleanupTask = null;
      logger.info('Rate cleanup task stopped');
    }
  }

  public stopBinanceAdsFetch(): void {
    if (this.binanceFetchTask) {
      this.binanceFetchTask.stop();
      this.binanceFetchTask = null;
      logger.info('Binance ads fetch task stopped');
    }
  }

  public stopBinanceAdsCleanup(): void {
    if (this.binanceCleanupTask) {
      this.binanceCleanupTask.stop();
      this.binanceCleanupTask = null;
      logger.info('Binance ads cleanup task stopped');
    }
  }

  public stopAllTasks(): void {
    this.stopRateCleanup();
    this.stopBinanceAdsFetch();
    this.stopBinanceAdsCleanup();
  }

  // Status checks now use the internal concurrency flags
  public getIsCleanupRunning(): boolean {
    return this.isRateCleanupRunning;
  }

  public getIsBinanceFetchRunning(): boolean {
    return this.isBinanceFetchRunning;
  }

  public getIsBinanceCleanupRunning(): boolean {
    return this.isBinanceCleanupRunning;
  }

  // Manual triggers now delegate to the worker's method
  public async manualRateCleanup(): Promise<
    Awaited<ReturnType<RateCleanupWorker['cleanupExpiredRates']>>
  > {
    logger.info('Manual rate cleanup triggered');
    return this.rateCleanupWorker.cleanupExpiredRates();
  }

  public async manualBinanceFetch(): Promise<void> {
    logger.info('Manual Binance ads fetch triggered');
    return this.binanceSyncWorker.fetchBinanceAds();
  }

  public async manualBinanceCleanup(): Promise<number> {
    logger.info('Manual Binance ads cleanup triggered');
    return this.binanceSyncWorker.cleanupExpiredBinanceAds();
  }
}

// --- Singleton Export (Updated Name) ---
let schedulerServiceInstance: SchedulerService | null = null;

/**
 * Returns a singleton instance of the SchedulerService.
 */
export function getSchedulerService(
  prisma: PrismaClient,
  binanceService: BinanceP2PAdSynchronizer
): SchedulerService {
  if (!schedulerServiceInstance) {
    schedulerServiceInstance = new SchedulerService(prisma, binanceService);
  }
  return schedulerServiceInstance;
}

export const schedulerService = getSchedulerService(prisma, binanceService);
