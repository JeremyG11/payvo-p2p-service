import {
  RateType,
  KenyaPaymentMethod,
  Source,
  UgandaPaymentMethod,
  FiatCurrency,
  EthiopiaPaymentMethod,
  CryptoCurrency,
  UnitedStatesPaymentMethod,
  SupportedPaymentMethodType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getBinanceRates } from "../utils/rateFetcher";
import { Decimal } from "@prisma/client/runtime/library";
import { TSupportedPaymentMethod } from "@/controllers/rates";

const DEFAULT_MARGIN_PERCENTAGE = new Decimal(2.5);
const RATE_EXPIRY_MINUTES = 5;

/**
 * Seeds the database with supported payment methods for a given fiat currency.
 * This function uses createMany with skipDuplicates: true for idempotency.
 * @param fiatCurrency The fiat currency.
 * @param paymentMethods An array of payment method names.
 * @param type The type of the payment method (e.g., BANK_ACCOUNT).
 */
async function seedSupportedPaymentMethods(
  fiatCurrency: FiatCurrency,
  paymentMethods: string[],
  type: SupportedPaymentMethodType
) {
  const data = paymentMethods.map((name) => ({
    name: name,
    type: type,
    currency: fiatCurrency,
    isActive: true,
  }));

  try {
    const result = await prisma.supportedPaymentMethod.createMany({
      data,
      skipDuplicates: true,
    });
    console.log(
      `Seeded ${result.count} supported payment methods for ${fiatCurrency}.`
    );
  } catch (error) {
    console.error(
      `Failed to seed supported payment methods for ${fiatCurrency}:`,
      error
    );
  }
}

/**
 * Fetches the IDs of all supported payment methods for a given fiat currency.
 * This function is used to create an in-memory map for efficient lookups.
 * @param fiatCurrency The fiat currency.
 * @returns A map from payment method name to its database ID.
 */
async function getPaymentMethodIdMap(fiatCurrency: FiatCurrency) {
  const supportedMethods = await prisma.supportedPaymentMethod.findMany({
    where: {
      currency: fiatCurrency,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });

  return supportedMethods.reduce((map, method) => {
    map[method.name] = method.id;
    return map;
  }, {} as Record<string, string>);
}

/**
 * Stores Binance rates in the database using a single, efficient bulk operation.
 * @param fiatCurrency The fiat currency for the rates.
 * @param paymentMethod The payment method for the rates.
 * @param rateType The type of rate (BUY or SELL).
 * @param ads An array of advertisement data from Binance.
 * @param idMap A map of payment method names to their database IDs.
 */
async function storeBinanceRates(
  fiatCurrency: FiatCurrency,
  paymentMethod: TSupportedPaymentMethod,
  rateType: RateType,
  ads: any[],
  idMap: Record<string, string>
) {
  if (ads.length === 0) {
    console.log(
      `No ads to store for ${fiatCurrency} - ${paymentMethod} (${rateType}).`
    );
    return;
  }

  // Get the ID from the in-memory map instead of making a new query
  const paymentMethodId = idMap[paymentMethod];

  if (!paymentMethodId) {
    console.error(`Supported method not found in map for ${paymentMethod}`);
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_EXPIRY_MINUTES * 60 * 1000);

  // Map the raw ad data to the format required by Prisma's createMany
  const rateData = ads.map((ad) => {
    // Calculate the adjusted rate with a margin, if the raw rate exists
    const adjustedRate = ad.rawRate
      ? new Decimal(ad.rawRate).mul(
          new Decimal(1).add(DEFAULT_MARGIN_PERCENTAGE.div(100))
        )
      : new Decimal(0);

    return {
      source: Source.BINANCE,
      fiatCurrency: fiatCurrency,
      cryptoCurrency: CryptoCurrency.USDT,
      rateType: rateType,
      // Use the ID from the fetched supported method
      paymentMethodId: paymentMethodId,
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
 * @param paymentType The type of the payment method.
 */
export async function fetchAndStoreBinanceFiatRates(
  fiatCurrency: FiatCurrency,
  paymentMethods: string[],
  paymentType: SupportedPaymentMethodType
) {
  /**
   * Seed the supported payment methods first.
   */
  await seedSupportedPaymentMethods(fiatCurrency, paymentMethods, paymentType);

  /**
   * Fetch all payment method IDs once after seeding
   */
  const idMap = await getPaymentMethodIdMap(fiatCurrency);

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
          buyAds,
          idMap 
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
          sellAds,
          idMap
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
    await Promise.all([
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.USD,
        Object.values(UnitedStatesPaymentMethod),
        SupportedPaymentMethodType.BANK_ACCOUNT
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.KES,
        Object.values(KenyaPaymentMethod),
        SupportedPaymentMethodType.BANK_ACCOUNT
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.ETB,
        Object.values(EthiopiaPaymentMethod),
        SupportedPaymentMethodType.BANK_ACCOUNT
      ),
      fetchAndStoreBinanceFiatRates(
        FiatCurrency.UGX,
        Object.values(UgandaPaymentMethod),
        SupportedPaymentMethodType.BANK_ACCOUNT
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
