import axios from "axios";
import { Decimal } from "@prisma/client/runtime/library";
import { RateType, CryptoCurrency, FiatCurrency } from "@prisma/client";

const BINANCE_P2P_URL =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

async function fetchBinanceP2PAds(
  fiat: string,
  tradeType: RateType = RateType.SELL,
  payTypes: string[] = [],
  limit: number = 3
) {
  try {
    const payload = {
      page: 1,
      rows: limit,
      asset: CryptoCurrency.USDT,
      fiat: fiat,
      tradeType,
      ...(payTypes.length > 0 && { payTypes: payTypes }),
    };

    const response = await axios.post(BINANCE_P2P_URL, payload);
    const adsData = response.data?.data;

    if (!adsData || adsData.length === 0) {
      console.warn(
        `No ${tradeType} ads found for USDT/${fiat} with payTypes: ${payTypes.join(
          ", "
        )} on Binance.`
      );
      return [];
    }

    return adsData.map((ad: any) => ({
      adId: ad.adv.advNo,
      rawRate: new Decimal(ad.adv.price),
      paymentMethod: ad.adv.tradeMethods
        .map((tm: any) => tm.tradeMethodName)
        .join(", "),
      volumeAvailable: ad.adv.tradableQuantity
        ? new Decimal(ad.adv.tradableQuantity)
        : null,
      minLimit: ad.adv.minSingleTransAmount
        ? new Decimal(ad.adv.minSingleTransAmount)
        : null,
      maxLimit: ad.adv.maxSingleTransAmount
        ? new Decimal(ad.adv.maxSingleTransAmount)
        : null,
    }));
  } catch (error: any) {
    console.error(
      `Error fetching Binance P2P (${tradeType} - ${fiat} - ${payTypes.join(
        ", "
      )}):`,
      error.message
    );
    if (error.response) {
      console.error("Binance API Response:", error.response.data);
    }
    return [];
  }
}

export async function getBinanceRates(
  fiat: FiatCurrency,
  payTypes: string[] = [],
  rateType: RateType = RateType.SELL,
  limit: number = 3
) {
  return await fetchBinanceP2PAds(fiat, rateType, payTypes, limit);
}
