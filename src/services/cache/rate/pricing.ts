import { logger } from '@/lib/logger';
import { PrismaClient, AdType } from '@prisma/client';
import Decimal from 'decimal.js';

export interface MarginConfig {
  margin: Decimal;
  minMargin?: Decimal;
  maxMargin?: Decimal;
}

export class PricingConfigService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get margin configuration for a specific corridor and ad type
   */
  async getMargin(
    fromCurrency: string,
    toCurrency: string,
    adType: AdType
  ): Promise<MarginConfig> {
    const corridor = `${fromCurrency}-${toCurrency}`;

    try {
      let config = await this.prisma.pricingConfig.findUnique({
        where: {
          corridor_adType: {
            corridor,
            adType,
          },
        },
      });

      // Fall back to global config if not found
      if (!config || !config.isActive) {
        config = await this.prisma.pricingConfig.findUnique({
          where: {
            corridor_adType: {
              corridor: 'GLOBAL',
              adType,
            },
          },
        });
      }

      // Fall back to default if still not found
      if (!config || !config.isActive) {
        const defaultMargin = adType === AdType.BUY ? 0.01 : 0.01;
        logger.warn(`Using default margin for ${corridor} ${adType}`);
        return {
          margin: new Decimal(defaultMargin),
          minMargin: new Decimal(defaultMargin * 0.5),
          maxMargin: new Decimal(defaultMargin * 2),
        };
      }

      return {
        margin: config.margin,
        minMargin: config.minMargin,
        maxMargin: config.maxMargin,
      };
    } catch (error) {
      logger.error('Failed to fetch pricing config', error);
      // Return safe defaults on error
      const defaultMargin = 0.01;
      return {
        margin: new Decimal(defaultMargin),
        minMargin: new Decimal(defaultMargin * 0.5),
        maxMargin: new Decimal(defaultMargin * 2),
      };
    }
  }

  /**
   * Apply margin to a base rate with bounds checking
   */
  applyMargin(
    baseRate: Decimal,
    adType: AdType,
    marginConfig: MarginConfig
  ): Decimal {
    let marginRate =
      adType === AdType.BUY
        ? baseRate.times(new Decimal(1).add(marginConfig.margin))
        : baseRate.times(new Decimal(1).minus(marginConfig.margin));

    // Apply minimum margin bound if specified
    if (marginConfig.minMargin) {
      const minRate =
        adType === AdType.BUY
          ? baseRate.times(new Decimal(1).add(marginConfig.minMargin))
          : baseRate.times(new Decimal(1).minus(marginConfig.minMargin));

      marginRate =
        adType === AdType.BUY
          ? Decimal.max(marginRate, minRate)
          : Decimal.min(marginRate, minRate);
    }

    // Apply maximum margin bound if specified
    if (marginConfig.maxMargin) {
      const maxRate =
        adType === AdType.BUY
          ? baseRate.times(new Decimal(1).add(marginConfig.maxMargin))
          : baseRate.times(new Decimal(1).minus(marginConfig.maxMargin));

      marginRate =
        adType === AdType.BUY
          ? Decimal.min(marginRate, maxRate)
          : Decimal.max(marginRate, maxRate);
    }

    return marginRate;
  }

  /**
   * Update or create a pricing configuration
   */
  async upsertConfig(
    corridor: string,
    adType: AdType,
    margin: Decimal,
    minMargin?: Decimal,
    maxMargin?: Decimal
  ): Promise<void> {
    await this.prisma.pricingConfig.upsert({
      where: {
        corridor_adType: {
          corridor,
          adType,
        },
      },
      update: {
        margin,
        minMargin,
        maxMargin,
        updatedAt: new Date(),
      },
      create: {
        corridor,
        adType,
        margin,
        minMargin,
        maxMargin,
      },
    });
  }
}
