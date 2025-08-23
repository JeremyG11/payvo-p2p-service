import {
  RateType,
  KenyaPaymentMethod,
  Source,
  UgandaPaymentMethod,
  FiatCurrency,
  EthiopiaPaymentMethod,
  CryptoCurrency,
  UnitedStatesPaymentMethod,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getBinanceRates } from "../utils/rateFetcher";
import { Decimal } from "@prisma/client/runtime/library";
import { TSupportedPaymentMethod } from "@/controllers/rates";

const DEFAULT_MARGIN_PERCENTAGE = new Decimal(2.5);
const RATE_EXPIRY_MINUTES = 5;

/**
 * Stores Binance rates in the database using a single, efficient bulk operation.
 * @param fiatCurrency The fiat currency for the rates.
 * @param paymentMethod The payment method for the rates.
 * @param rateType The type of rate (BUY or SELL).
 * @param ads An array of advertisement data from Binance.
 */
async function storeBinanceRates(
  fiatCurrency: FiatCurrency,
  paymentMethod: TSupportedPaymentMethod,
  rateType: RateType,
  ads: any[]
) {
  if (ads.length === 0) {
    console.log(
      `No ads to store for ${fiatCurrency} - ${paymentMethod} (${rateType}).`
    );
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_EXPIRY_MINUTES * 60 * 1000);

  // Map the raw ad data to the format required by Prisma's createMany
  const rateData = ads.map((ad) => {
    // Calculate the adjusted rate with a margin, if the raw rate exists
    const adjustedRate = ad.rawRate
      ? ad.rawRate.mul(new Decimal(1).add(DEFAULT_MARGIN_PERCENTAGE.div(100)))
      : new Decimal(0); 

    return {
      source: Source.BINANCE,
      fiatCurrency: fiatCurrency,
      cryptoCurrency: CryptoCurrency.USDT,
      rateType: rateType,
      paymentMethod: paymentMethod as TSupportedPaymentMethod,
      rawRate: String(ad.rawRate),
      adjustedRate: String(adjustedRate),
      marginPercentage: String(DEFAULT_MARGIN_PERCENTAGE),
      volumeAvailable: String(ad.volumeAvailable),
      minLimit: String(ad.minLimit),
      maxLimit: String(ad.maxLimit),
      adId: ad.adId,
      expiresAt: expiresAt,
    };
  });

  try {
    /**
     * Use createMany for efficient bulk insertion.
     * skipDuplicates ensures that if the same adId already exists, it won't be inserted again.
     * This is important to avoid duplicate entries when the function is called multiple times with overlapping data.
     */
    const result = await prisma.fiatCryptoRate.createMany({
      data: rateData,
      skipDuplicates: true,
    });
    console.log(
      `Successfully stored ${result.count} rates for ${fiatCurrency} - ${paymentMethod} (${rateType}).`
    );
  } catch (error) {
    console.error(
      `Failed to store rates for ${fiatCurrency} - ${paymentMethod} (${rateType}):`,
      error
    );
  }
}

/**
 * Fetches and stores Binance rates for a given fiat currency and list of payment methods.
 * This function processes requests concurrently for better performance.
 * @param fiatCurrency The fiat currency to fetch rates for.
 * @param paymentMethods An array of payment methods.
 */
export async function fetchAndStoreBinanceFiatRates(
  fiatCurrency: FiatCurrency,
  paymentMethods:
    | EthiopiaPaymentMethod[]
    | KenyaPaymentMethod[]
    | UgandaPaymentMethod[]
    | UnitedStatesPaymentMethod[] = []
) {
  /**
   * Create an array of tasks for fetching and storing rates concurrently.
   * Each payment method will have two tasks: one for BUY rates and one for SELL rates
   */
  const tasks = paymentMethods.flatMap((method) => [
    (async () => {
      try {
        const buyAds = await getBinanceRates(
          fiatCurrency,
          [method as string],
          RateType.BUY,
          3
        );
        await storeBinanceRates(
          fiatCurrency,
          method as TSupportedPaymentMethod,
          RateType.BUY,
          buyAds
        );
      } catch (error) {
        console.error(
          `Error processing BUY ads for ${fiatCurrency} - ${method}:`,
          error
        );
      }
    })(),

    // Task to fetch and store SELL ads
    (async () => {
      try {
        const sellAds = await getBinanceRates(
          fiatCurrency,
          [method as string],
          RateType.SELL,
          3
        );
        await storeBinanceRates(
          fiatCurrency,
          method as TSupportedPaymentMethod,
          RateType.SELL,
          sellAds
        );
      } catch (error) {
        console.error(
          `Error processing SELL ads for ${fiatCurrency} - ${method}:`,
          error
        );
      }
    })(),
  ]);

  await Promise.allSettled(tasks);
  console.log(`Finished fetching and storing rates for ${fiatCurrency}.`);
}

/**
 * Orchestrates the fetching and storing of Binance rates for all supported regions.
 */
export async function fetchAndStoreAllBinanceRates() {
  try {
    // Use Promise.all to execute all regional tasks in parallel
    await Promise.all([
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.USD,
        Object.values(UnitedStatesPaymentMethod)
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.KES,
        Object.values(KenyaPaymentMethod)
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.ETB,
        Object.values(EthiopiaPaymentMethod)
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.UGX,
        Object.values(UgandaPaymentMethod)
      ),
    ]);
    console.log("All Binance rates successfully fetched and stored.");
  } catch (error) {
    console.error(
      "An error occurred during the overall rate fetching process:",
      error
    );
  }
}
