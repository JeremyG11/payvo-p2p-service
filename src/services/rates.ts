import {
  RateType,
  Source,
  FiatCurrency,
  CryptoCurrency,
  PaymentMethodCategory,
  Ad,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getBinanceRates, ProcessedAd } from '@/utils/rate-fetcher';
import { Decimal } from '@prisma/client/runtime/library';
import { rateConfigs } from '@/config/rate.config';

const DEFAULT_MARGIN_PERCENTAGE = new Decimal(2.5);
const RATE_EXPIRY_MINUTES = 5;

/**
 * Seeds the database with supported payment methods for a given fiat currency.
 * This function uses upsert for idempotency.
 * @param fiatCurrency The fiat currency.
 * @param paymentMethods An array of payment method configurations.
 */
async function seedSupportedPaymentMethods(
  fiatCurrency: FiatCurrency,
  paymentMethods: {
    provider: string;
    displayName: string;
    category: PaymentMethodCategory;
  }[]
) {
  console.log(
    `Seeding supported payment methods for ${fiatCurrency}:`,
    paymentMethods
  );

  try {
    for (const method of paymentMethods) {
      await prisma.supportedPaymentMethod.upsert({
        where: {
          provider_currency: {
            provider: method.provider,
            currency: fiatCurrency,
          },
        },
        update: {
          displayName: method.displayName,
          category: method.category,
          isActive: true,
        },
        create: {
          provider: method.provider,
          category: method.category,
          currency: fiatCurrency,
          isActive: true,
          displayName: method.displayName,
        },
      });
    }
    console.log(
      `Successfully upserted ${paymentMethods.length} payment methods for ${fiatCurrency}.`
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
 * @returns A map from payment method provider to its database ID.
 */
async function getPaymentMethodIdMap(fiatCurrency: FiatCurrency) {
  const supportedMethods = await prisma.supportedPaymentMethod.findMany({
    where: {
      currency: fiatCurrency,
      isActive: true,
    },
    select: {
      id: true,
      provider: true,
    },
  });

  return supportedMethods.reduce((map, method) => {
    map[method.provider] = method.id;
    return map;
  }, {} as Record<string, string>);
}

/**
 * Stores Binance rates in the database using a single, efficient bulk operation.
 * @param fiatCurrency The fiat currency for the rates.
 * @param paymentMethodProvider The payment method provider for the rates.
 * @param rateType The type of rate (BUY or SELL).
 * @param ads An array of advertisement data from Binance.
 * @param idMap A map of payment method providers to their database IDs.
 */
async function storeBinanceRates(
  fiatCurrency: FiatCurrency,
  paymentMethodProvider: string,
  rateType: RateType,
  ads: ProcessedAd[],
  idMap: Record<string, string>
) {
  if (ads.length === 0) {
    console.log(
      `No ads to store for ${fiatCurrency} - ${paymentMethodProvider} (${rateType}).`
    );
    return;
  }

  const paymentMethodId = idMap[paymentMethodProvider];

  if (!paymentMethodId) {
    console.error(
      `Supported method not found in map for ${paymentMethodProvider}`
    );
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_EXPIRY_MINUTES * 60 * 1000);

  const rateData = ads.map((ad) => {
    return {
      source: Source.BINANCE,
      fiatCurrency: fiatCurrency,
      cryptoCurrency: CryptoCurrency.USDT,
      rateType: rateType,
      supportedPaymentMethodId: paymentMethodId,
      rawRate: String(ad.rawRate),
      volumeAvailable: String(ad.volumeAvailable),
      minLimit: String(ad.minLimit),
      maxLimit: String(ad.maxLimit),
      advNo: ad.advNo,
      paymentMethodProvider: ad.paymentMethodProvider,
      expiresAt: expiresAt,
    };
  });

  try {
    const result = await prisma.fiatCryptoRate.createMany({
      data: rateData,
      skipDuplicates: true,
    });
    console.log(
      `Successfully stored ${result.count} rates for ${fiatCurrency} - ${paymentMethodProvider} (${rateType}).`
    );
  } catch (error) {
    console.error(
      `Failed to store rates for ${fiatCurrency} - ${paymentMethodProvider} (${rateType}):`,
      error
    );
  }
}

/**
 * Fetches and stores Binance rates for a given country's configuration.
 * @param config The configuration object for a specific country.
 */
async function fetchAndStoreBinanceRatesForCountry(
  config: (typeof rateConfigs)[number]
) {
  const { fiatCurrency, paymentMethods } = config;

  await seedSupportedPaymentMethods(fiatCurrency, paymentMethods as any);
  const idMap = await getPaymentMethodIdMap(fiatCurrency);

  const tasks = paymentMethods.flatMap((method) => [
    (async () => {
      try {
        const buyAds = await getBinanceRates(
          fiatCurrency,
          [method.provider],
          RateType.BUY,
          3
        );
        await storeBinanceRates(
          fiatCurrency,
          method.provider,
          RateType.BUY,
          buyAds,
          idMap
        );
      } catch (error) {
        console.error(
          `Error processing BUY ads for ${fiatCurrency} - ${method.provider}:`,
          error
        );
      }
    })(),
    (async () => {
      try {
        const sellAds = await getBinanceRates(
          fiatCurrency,
          [method.provider],
          RateType.SELL,
          3
        );
        await storeBinanceRates(
          fiatCurrency,
          method.provider,
          RateType.SELL,
          sellAds,
          idMap
        );
      } catch (error) {
        console.error(
          `Error processing SELL ads for ${fiatCurrency} - ${method.provider}:`,
          error
        );
      }
    })(),
  ]);

  await Promise.allSettled(tasks);
  console.log(`Finished fetching and storing rates for ${fiatCurrency}.`);
}

/**
 * Orchestrates the fetching and storing of Binance rates for all supported regions
 * based on a centralized configuration.
 */
export async function fetchAndStoreAllBinanceRates() {
  try {
    const tasks = rateConfigs.map((config) =>
      fetchAndStoreBinanceRatesForCountry(config)
    );
    await Promise.all(tasks);
    console.log('All Binance rates successfully fetched and stored.');
  } catch (error) {
    console.error(
      'An error occurred during the overall rate fetching process:',
      error
    );
  }
}
