import Decimal from 'decimal.js';
import { AdType, CryptoCurrency, FiatCurrency } from '@prisma/client';
import { logger } from '@/lib/logger';
import { PricingConfigService } from '@/services/cache/rate/pricing';

const STATIC_MARGIN_CONFIG = {
  INBOUND: 0.01, // Fallback value for BUY
  OUTBOUND: 0.01, // Fallback value for SELL
};

/**
 * MarginApplier is responsible for fetching pricing configurations (margins)
 * and applying them to a base rate, respecting min/max bounds.
 */
export class MarginApplier {
  constructor(
    private readonly pricingConfigService: PricingConfigService,
    private readonly log: typeof logger
  ) {}

  /**
   * Applies the configured inbound or outbound margin to the base rate.
   * It prioritizes dynamic margins from the PricingConfigService and falls back
   * to static configuration on failure.
   * @param baseRate - The raw market rate before margin.
   * @returns The final rate after margin and bounds application.
   */
  public async applyMargin(
    baseRate: Decimal,
    adType: AdType,
    fiatCurrency: FiatCurrency,
    cryptoCurrency: CryptoCurrency
  ): Promise<Decimal> {
    try {
      // 1. Fetch dynamic margin configuration
      const marginConfig = await this.pricingConfigService.getMargin(
        fiatCurrency,
        cryptoCurrency,
        adType
      );
      const margin = marginConfig.margin;
      const minMargin = marginConfig.minMargin;
      const maxMargin = marginConfig.maxMargin;
      let finalRate = new Decimal(baseRate);

      // 2. Apply the primary margin
      finalRate =
        adType === AdType.BUY
          ? baseRate.times(new Decimal(1).add(margin))
          : baseRate.times(new Decimal(1).minus(margin));

      // 3. Apply min margin bound if set (ensures rate is not too close to market)
      if (minMargin !== undefined && minMargin !== null) {
        const minRateBound =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(minMargin))
            : baseRate.times(new Decimal(1).minus(minMargin));

        // BUY: Rate must be >= minRateBound. SELL: Rate must be <= minRateBound.
        finalRate =
          adType === AdType.BUY
            ? Decimal.max(finalRate, minRateBound)
            : Decimal.min(finalRate, minRateBound);
      }

      // 4. Apply max margin bound if set (ensures rate is not too far from market)
      if (maxMargin !== undefined && maxMargin !== null) {
        const maxRateBound =
          adType === AdType.BUY
            ? baseRate.times(new Decimal(1).add(maxMargin))
            : baseRate.times(new Decimal(1).minus(maxMargin));

        // BUY: Rate must be <= maxRateBound. SELL: Rate must be >= maxRateBound.
        finalRate =
          adType === AdType.BUY
            ? Decimal.min(finalRate, maxRateBound)
            : Decimal.max(finalRate, maxRateBound);
      }

      return finalRate;
    } catch (error) {
      this.log.error('Failed to apply dynamic margin, using static fallback', {
        error,
      });
      // Fallback to static margin
      const staticMargin =
        adType === AdType.BUY
          ? STATIC_MARGIN_CONFIG.INBOUND
          : STATIC_MARGIN_CONFIG.OUTBOUND;
      return adType === AdType.BUY
        ? baseRate.times(new Decimal(1 + staticMargin))
        : baseRate.times(new Decimal(1 - staticMargin));
    }
  }
}
