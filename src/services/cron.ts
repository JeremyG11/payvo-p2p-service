import cron, { ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { AdStatus } from '@prisma/client';

export class RateCleanupService {
  private cleanupTask: ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor() {}

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

  public scheduleRateCleanup(
    cronExpression: string = '*/5 * * * *'
  ): ScheduledTask {
    if (this.cleanupTask) {
      this.stopRateCleanup();
    }

    this.cleanupTask = cron.schedule(
      cronExpression,
      async () => {
        if (this.isRunning) {
          logger.debug('Rate cleanup already in progress, skipping');
          return;
        }

        this.isRunning = true;
        try {
          logger.debug('Starting scheduled rate cleanup');
          await this.cleanupExpiredRates();
          logger.debug('Completed scheduled rate cleanup');
        } catch (error) {
          logger.error('Error in scheduled rate cleanup:', error);
        } finally {
          this.isRunning = false;
        }
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info(`Rate cleanup scheduled with expression: ${cronExpression}`);
    return this.cleanupTask;
  }

  public stopRateCleanup(): void {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      logger.info('Rate cleanup task stopped');
    }
  }

  public isCleanupRunning(): boolean {
    return this.isRunning;
  }

  public async manualCleanup(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    logger.info('Manual rate cleanup triggered');
    return this.cleanupExpiredRates();
  }
}

let rateCleanupServiceInstance: RateCleanupService | null = null;

export function getRateCleanupService(): RateCleanupService {
  if (!rateCleanupServiceInstance) {
    rateCleanupServiceInstance = new RateCleanupService();
  }
  return rateCleanupServiceInstance;
}

export const rateCleanupService = getRateCleanupService();
