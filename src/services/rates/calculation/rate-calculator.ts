import Decimal from 'decimal.js';
import { RawAdRate } from '../../../types/interface';

/**
 * Defines the core mathematical operations for rate calculation,
 * including median finding, outlier filtering, and volume weighting.
 */
export class RateCalculator {
  private readonly MAX_RATE_DEVIATION = 0.05;

  /**
   * Calculates the volume-weighted average rate from a list of ads.
   * @param ads - List of raw ad rates with available volume and limits.
   * @returns The volume-weighted rate as a Decimal.
   */
  public calculateVolumeWeightedRate(ads: RawAdRate[]): Decimal {
    if (ads.length === 0) return new Decimal(0);
    let totalVolume = new Decimal(0);
    let weightedSum = new Decimal(0);

    for (const ad of ads) {
      // Calculate the effective volume (min of available volume and max transaction limit)
      const volume = Decimal.min(
        ad.volumeAvailable,
        ad.maxLimit ?? ad.volumeAvailable
      );
      totalVolume = totalVolume.add(volume);
      weightedSum = weightedSum.add(ad.rawRate.times(volume));
    }

    return totalVolume.isZero()
      ? new Decimal(0)
      : weightedSum.dividedBy(totalVolume);
  }

  /**
   * Filters a list of ads, removing those whose rates deviate significantly from the median.
   * Rates that deviate by more than MAX_RATE_DEVIATION from the median are filtered.
   * @param ads - List of raw ad rates.
   * @returns A filtered list of RawAdRate.
   */
  public filterAdsByDeviation(ads: RawAdRate[]): RawAdRate[] {
    if (ads.length === 0) return [];
    const rates = ads.map((ad) => ad.rawRate.toNumber());
    const median = this._calculateMedian(rates);

    // If median is zero, filtering by deviation is undefined/risky, so return all ads.
    if (median === 0) {
      return ads;
    }

    return ads.filter((ad) => {
      const deviation = Math.abs(ad.rawRate.toNumber() - median) / median;
      return deviation <= this.MAX_RATE_DEVIATION;
    });
  }

  /**
   * Calculates the median of a numeric array.
   */
  private _calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  public computeDeviationPercent(
    ads: RawAdRate[],
    marketRate: Decimal
  ): RawAdRate[] {
    return ads.map((ad) => ({
      ...ad,
      deviationPercent: marketRate.isZero()
        ? new Decimal(0)
        : ad.rawRate.minus(marketRate).dividedBy(marketRate),
    }));
  }
}

export const rateCalculator = new RateCalculator();
