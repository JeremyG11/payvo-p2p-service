import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { RateType, CryptoCurrency, FiatCurrency } from '@prisma/client';

const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

interface TradeMethod {
  tradeMethodName: string;
}

interface Adv {
  advNo: string;
  price: string;
  tradeMethods: TradeMethod[];
  tradableQuantity: string;
  minSingleTransAmount: string;
  maxSingleTransAmount: string;
}

interface BinanceP2PResponseData {
  adv: Adv;
}

interface BinanceP2PResponse {
  data?: BinanceP2PResponseData[];
}

export interface ProcessedAd {
  advNo: string;
  rawRate: Decimal;
  paymentMethod: string;
  paymentMethodProvider: string;
  volumeAvailable: Decimal | null;
  minLimit: Decimal | null;
  maxLimit: Decimal | null;
}

async function fetchBinanceP2PAds(
  fiat: string,
  tradeType: RateType = RateType.SELL,
  payTypes: string[] = [],
  limit: number = 3
): Promise<ProcessedAd[]> {
  try {
    const payload = {
      page: 1,
      rows: limit,
      asset: CryptoCurrency.USDT,
      fiat,
      tradeType,
      ...(payTypes.length > 0 && { payTypes }),
    };

    const response = await axios.post<BinanceP2PResponse>(
      BINANCE_P2P_URL,
      payload
    );

    const adsData = response.data?.data;

    if (!adsData || adsData.length === 0) {
      console.warn(
        `No ${tradeType} ads found for USDT/${fiat} with payTypes: ${payTypes.join(
          ', '
        )} on Binance.`
      );
      return [];
    }

    return adsData.map((ad) => ({
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
  } catch (error: unknown) {
    console.error(
      `Error fetching Binance P2P (${tradeType} - ${fiat} - ${payTypes.join(
        ', '
      )}:`,
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

export async function getBinanceRates(
  fiat: FiatCurrency,
  payTypes: string[] = [],
  rateType: RateType = RateType.SELL,
  limit: number = 3
): Promise<ProcessedAd[]> {
  return await fetchBinanceP2PAds(fiat, rateType, payTypes, limit);
}
