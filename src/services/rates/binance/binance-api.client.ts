import axios from 'axios';
import { logger } from '@/lib/logger';
import { AdType, CryptoCurrency, FiatCurrency } from '@prisma/client';

// Define the Binance API URL
const BINANCE_P2P_URL =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// --- Interfaces for Binance API ---
interface TradeMethod {
  tradeMethodName: string;
}

export interface RawBinanceAdv {
  advNo: string;
  price: string;
  tradeMethods: TradeMethod[];
  tradableQuantity: string;
  minSingleTransAmount: string;
  maxSingleTransAmount: string;
}

interface BinanceP2PResponseData {
  adv: RawBinanceAdv;
}

interface BinanceP2PResponse {
  data?: BinanceP2PResponseData[];
}
// --- End Interfaces ---

/**
 * BinanceAPIClient handles direct communication with the external Binance P2P API.
 * It is responsible for making HTTP requests and basic error handling, returning
 * raw, unprocessed data.
 */
export class BinanceAPIClient {
  constructor(private readonly log: typeof logger) {}

  /**
   * Fetches the raw list of ads from the Binance P2P API for a given pair.
   * @param fiat - The fiat currency code.
   * @param tradeType - BUY or SELL.
   * @param limit - Max number of ads to fetch.
   * @param payTypes - Optional payment method filters.
   * @returns A promise that resolves to an array of RawBinanceAdv objects.
   */
  public async fetchBinanceP2PAds(
    fiat: FiatCurrency,
    tradeType: AdType,
    limit: number = 15,
    payTypes: string[] = []
  ): Promise<RawBinanceAdv[]> {
    try {
      const payload = {
        page: 1,
        rows: limit,
        asset: CryptoCurrency.USDT,
        fiat: fiat,
        tradeType: tradeType,
        ...(payTypes.length > 0 && { payTypes }),
      };

      this.log.debug(`Fetching Binance P2P ads for ${fiat} (${tradeType})`);

      const response = await axios.post<BinanceP2PResponse>(
        BINANCE_P2P_URL,
        payload,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      return response.data?.data?.map((item) => item.adv) || [];
    } catch (error) {
      this.log.error('Error fetching Binance P2P ads from API:', error);
      if (axios.isAxiosError(error)) {
        this.log.error('Binance API error details:', {
          status: error.response?.status,
          data: error.response?.data,
        });
      }
      return [];
    }
  }
}
