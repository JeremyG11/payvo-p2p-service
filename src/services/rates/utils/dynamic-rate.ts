import axios from 'axios';
 import { AdType, CryptoCurrency } from '@prisma/client';
import Decimal from 'decimal.js';

// Define the Binance API URL
const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// Interface for a single trade method
interface TradeMethod {
  tradeMethodName: string;
}

// Interface for a single ad from the Binance API
interface Adv {
  advNo: string;
  price: string;
  tradeMethods: TradeMethod[];
  tradableQuantity: string;
  minSingleTransAmount: string;
  maxSingleTransAmount: string;
}

// Interface for the Binance API response data
interface BinanceP2PResponseData {
  adv: Adv;
}

// Interface for the full Binance API response
interface BinanceP2PResponse {
  data?: BinanceP2PResponseData[];
}

// Interface for a processed ad with relevant fields
export interface ProcessedAd {
  advNo: string;
  rawRate: Decimal;
  paymentMethod: string;
  paymentMethodProvider: string;
  volumeAvailable: Decimal | null;
  minLimit: Decimal | null;
  maxLimit: Decimal | null;
}

/**
 * A utility function to calculate the median of an array of numbers.
 * The median is a better choice than the average for filtering out outliers.
 * @param numbers The array of numbers to calculate the median for.
 * @returns The median value.
 */
function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = numbers.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

/**
 * Calculates a volume-weighted average price from a list of ads.
 * This gives more importance to ads with larger available liquidity.
 * @param ads The array of ProcessedAd objects.
 * @returns The calculated volume-weighted average price.
 */
export function calculateVolumeWeightedAverage(ads: ProcessedAd[]): Decimal {
  if (ads.length === 0) {
    return new Decimal(0);
  }

  let totalVolume = new Decimal(0);
  let totalWeightedRate = new Decimal(0);

  for (const ad of ads) {
    const volume = ad.volumeAvailable;
    const rate = ad.rawRate;

    if (volume && volume.isPositive() && rate.isPositive()) {
      totalVolume = totalVolume.plus(volume);
      totalWeightedRate = totalWeightedRate.plus(volume.times(rate));
    }
  }

  if (totalVolume.isZero()) {
    // Fallback to a simple median if no volume data is available
    const rates = ads.map((ad) => ad.rawRate.toNumber());
    const medianRate = calculateMedian(rates);
    return new Decimal(medianRate);
  }

  return totalWeightedRate.dividedBy(totalVolume);
}

/**
 * Fetches ads from the Binance P2P API and processes them.
 * This is the raw data fetching layer.
 * @param fiat The fiat currency to fetch ads for (e.g., 'ETB').
 * @param tradeType The type of trade (BUY or SELL).
 * @param payTypes An optional array of payment method strings.
 * @param limit The number of ads to fetch.
 * @param minVolume The minimum volume threshold in USD equivalent.
 * @returns A promise that resolves with an array of processed ads.
 */
async function fetchBinanceP2PAds(
  fiat: string,
  tradeType: AdType = AdType.SELL,
  payTypes: string[] = [],
  limit: number = 3,
  minVolume: number = 0
): Promise<ProcessedAd[]> {
  try {
    // CONCEPT: Caching would be implemented here to check for a recent response
    // if (cache.has(cacheKey)) { return cache.get(cacheKey); }

    const payload = {
      page: 1,
      rows: limit,
      asset: CryptoCurrency.USDT,
      fiat,
      tradeType,
      ...(payTypes.length > 0 && { payTypes }),
      // Optional volume filter
      ...(minVolume > 0 && {
        // Binance API uses 'minAmount' for this filter
        minAmount: minVolume.toString(),
      }),
    };

    const response = await axios.post<BinanceP2PResponse>(
      BINANCE_P2P_URL,
      payload
    );

    const adsData = response.data?.data;
    if (!adsData || adsData.length === 0) {
      console.warn(
        `No ${tradeType} ads found for USDT/${fiat} with the specified filters.`
      );
      return [];
    }
    const processedAds = adsData.map((ad) => ({
      advNo: ad.adv.advNo,
      rawRate: new Decimal(ad.adv.price),
      paymentMethod: ad.adv.tradeMethods
        .map((tm) => tm.tradeMethodName)
        .join(', '),
      volumeAvailable: ad.adv.tradableQuantity
        ? new Decimal(ad.adv.tradableQuantity)
        : null,
      minLimit: ad.adv.minSingleTransAmount
        ? new Decimal(ad.adv.minSingleTransAmount)
        : null,
      maxLimit: ad.adv.maxSingleTransAmount
        ? new Decimal(ad.adv.maxSingleTransAmount)
        : null,
      paymentMethodProvider: ad.adv.tradeMethods[0].tradeMethodName,
    }));

    // CONCEPT: Cache the result before returning
    // cache.set(cacheKey, processedAds);

    return processedAds;
  } catch (error: unknown) {
    console.error(
      `Error fetching Binance P2P (${tradeType} - ${fiat} - ${payTypes.join(
        ', '
      )}):`,
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as any).message
        : String(error)
    );
    if ((error as any).response) {
      console.error('Binance API Response:', (error as any).response.data);
    }
    return [];
  }
}

/**
 * A sophisticated function to get Binance P2P rates using a dynamic volume threshold.
 * It first samples the market to determine a median minimum trade amount,
 * then uses that as a filter for a more precise second data fetch.
 * @param fiat The fiat currency to fetch ads for (e.g., 'ETB').
 * @param payTypes An optional array of payment method strings.
 * @param adType The type of trade (BUY or SELL).
 * @param adsToSample The number of ads to sample for the initial median calculation.
 * @param adsForFinalRate The number of ads to fetch for the final rate calculation.
 * @returns A promise that resolves with an array of processed ads for the final rate.
 */
export async function getBinanceRatesDynamically(
  fiat: string,
  payTypes: string[] = [],
  adType: AdType = AdType.SELL,
  adsToSample: number = 50,
  adsForFinalRate: number = 5
): Promise<ProcessedAd[]> {
  // Step 1: Sample the market to find a dynamic minimum volume.
  console.log(
    `[INFO] Step 1: Fetching initial sample of ${adsToSample} ads to determine median minimum for ${fiat}.`
  );
  const sampleAds = await fetchBinanceP2PAds(
    fiat,
    adType,
    payTypes,
    adsToSample
  );

  if (sampleAds.length === 0) {
    console.warn(
      `[WARN] Initial sample for ${fiat} returned no ads. Aborting dynamic rate calculation.`
    );
    return [];
  }

  // Extract all minimum limits to calculate the median.
  const minLimits = sampleAds
    .map((ad) => (ad.minLimit ? ad.minLimit.toNumber() : 0))
    .filter((limit) => limit > 0);

  // Calculate the median minimum volume, which becomes our dynamic threshold.
  const dynamicMinVolume = calculateMedian(minLimits);

  console.log(
    `[INFO] Calculated dynamic minimum volume: ${dynamicMinVolume.toFixed(
      2
    )} ${fiat}`
  );

  // Step 2: Make a second, more precise call with the dynamic threshold.
  console.log(
    `[INFO] Step 2: Fetching top ${adsForFinalRate} ads using the dynamic threshold for final rate calculation.`
  );
  const finalAds = await fetchBinanceP2PAds(
    fiat,
    adType,
    payTypes,
    adsForFinalRate,
    dynamicMinVolume
  );

  // Step 3: Check for resilience and return the results.
  if (finalAds.length < adsForFinalRate) {
    console.warn(
      `[WARN] Expected ${adsForFinalRate} ads, but only found ${finalAds.length}. The final rate might be less reliable.`
    );
  } else {
    console.log(
      `[INFO] Found ${finalAds.length} ads for final rate calculation.`
    );
  }

  return finalAds;
}

async function main() {
  const finalAds = await getBinanceRatesDynamically('ETB', ['CBE Birr']);
  if (finalAds.length > 0) {
    const finalRate = calculateVolumeWeightedAverage(finalAds);
    console.log(
      `[INFO] Calculated final volume-weighted average rate: ${finalRate.toFixed(
        4
      )}`
    );
    console.log('Final Ads used for Rate Calculation:');
    console.log(
      finalAds.map((ad) => ({
        advNo: ad.advNo,
        minLimit: ad.minLimit?.toString(),
        rawRate: ad.rawRate.toString(),
        volumeAvailable: ad.volumeAvailable?.toString(),
      }))
    );
  } else {
    console.log(
      '[ERROR] Could not retrieve sufficient ads for rate calculation.'
    );
  }
}
