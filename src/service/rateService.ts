import {
  Source,
  RateType,
  FiatCurrency,
  CryptoCurrency,
  KenyaPaymentMethod,
  UgandaPaymentMethod,
  EthiopiaPaymentMethod,
  UnitedStatesPaymentMethod,
} from "@prisma/client";

import { db } from "@/lib/prisma";
import { TPaymentMethod } from "@/types";
import { getBinanceRates } from "../utils/rateFetcher";
import { Decimal } from "@prisma/client/runtime/library";

const DEFAULT_MARGIN_PERCENTAGE = new Decimal(2.5);
const RATE_EXPIRY_MINUTES = 5;

async function storeBinanceRates(
  fiatCurrency: FiatCurrency,
  paymentMethod: TPaymentMethod,
  rateType: RateType,
  ads: any[]
) {
  const now = new Date();

  const expiresAt = new Date(now.getTime() + RATE_EXPIRY_MINUTES * 60 * 1000);

  for (const ad of ads) {
    const adjustedRate = ad.rawRate
      ? ad.rawRate.mul(new Decimal(1).add(DEFAULT_MARGIN_PERCENTAGE.div(100)))
      : undefined;

    await db.fiatCryptoRate.create({
      data: {
        source: Source.BINANCE,
        fiatCurrency: fiatCurrency,
        cryptoCurrency: CryptoCurrency.USDT,
        rateType: rateType,
        paymentMethod: paymentMethod,
        rawRate: ad.rawRate,
        adjustedRate: adjustedRate,
        marginPercentage: DEFAULT_MARGIN_PERCENTAGE,
        volumeAvailable: ad.volumeAvailable,
        minLimit: ad.minLimit,
        maxLimit: ad.maxLimit,
        adId: ad.adId,
        expiresAt: expiresAt,
      },
    });
  }
}

export async function fetchAndStoreBinanceFiatRates(
  fiatCurrency: FiatCurrency,
  paymentMethods:
    | EthiopiaPaymentMethod[]
    | KenyaPaymentMethod[]
    | UgandaPaymentMethod[]
    | UnitedStatesPaymentMethod[] = []
) {
  for (const method of paymentMethods) {
    const buyAds = await getBinanceRates(
      fiatCurrency,
      [method as string],
      RateType.BUY,
      3
    );
    await storeBinanceRates(fiatCurrency, method, RateType.BUY, buyAds);

    const sellAds = await getBinanceRates(
      fiatCurrency,
      [method as string],
      RateType.SELL,
      3
    );
    await storeBinanceRates(fiatCurrency, method, RateType.SELL, sellAds);
  }
}

export async function fetchAndStoreAllBinanceRates() {
  // Fetch and store rates for United States
  await fetchAndStoreBinanceFiatRates(
    FiatCurrency.USD,
    Object.values(UnitedStatesPaymentMethod)
  );
  // Fetch and store rates for Kenya
  await fetchAndStoreBinanceFiatRates(
    FiatCurrency.KES,
    Object.values(KenyaPaymentMethod)
  );

  // Fetch and store rates for Ethiopia
  await fetchAndStoreBinanceFiatRates(
    FiatCurrency.ETB,
    Object.values(EthiopiaPaymentMethod)
  );

  // Fetch and store rates for Uganda
  await fetchAndStoreBinanceFiatRates(
    FiatCurrency.UGX,
    Object.values(UgandaPaymentMethod)
  );
}
