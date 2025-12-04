import { logger } from '@/lib/logger';
import { AdStatus, PrismaClient } from '@/generated/prisma/client';

/**
 * RateCleanupWorker is responsible for cleaning up expired internal P2P
 * rates (BinanceP2PAd) and updating the status of associated user ads.
 * It strictly handles the data cleanup process, independent of scheduling logic.
 */
export class RateCleanupWorker {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Cleans up expired rates and updates associated ads to INACTIVE status.
   * This logic assumes the Ad ID links directly to the BinanceP2PAd ID for cleanup.
   */
  public async cleanupExpiredRates(): Promise<{
    updatedAdsCount: number;
    deletedRatesCount: number;
  }> {
    try {
      logger.debug('Starting scheduled rate cleanup');

      // Find all expired internal rates (BinanceP2PAd)
      const expiredRates = await this.prisma.binanceP2PAd.findMany({
        where: {
          expiresAt: {
            lte: new Date(),
          },
        },
        select: {
          advNo: true,
        },
      });

      const advNosToInactivate = expiredRates.map((rate) => rate.advNo);
      logger.debug(
        `Found ${advNosToInactivate.length} expired rates to clean up`
      );

      if (advNosToInactivate.length === 0) {
        logger.info('No expired rates to clean up');
        return { updatedAdsCount: 0, deletedRatesCount: 0 };
      }

      // Update associated user ads to INACTIVE status
      const updatedAdsCountResult = await this.prisma.ad.updateMany({
        where: {
          advNo: {
            in: advNosToInactivate,
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

      // Delete the expired internal rates
      const deletedRatesCountResult = await this.prisma.binanceP2PAd.deleteMany(
        {
          where: {
            advNo: {
              in: advNosToInactivate,
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
    }
  }
}
