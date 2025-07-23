import { Request, Response, Router } from "express";
import {
  EthiopiaPaymentMethod,
  FiatCurrency,
  KenyaPaymentMethod,
  PrismaClient,
  RateType,
} from "@prisma/client";

export class RateController {
  private prisma: PrismaClient;
  public router: Router;

  constructor() {
    this.prisma = new PrismaClient();
    this.router = Router();
    this.routes();
  }

  /**
   * Fetches the best rates for USDT/KES with MPesa Kenya payment method.
   * @param req - The request object containing user information.
   * @param res - The response object used to send the result back to the client.
   * @returns The best rates for USDT/KES or an error message.
   */
  private async getBestRatesFromDB(
    fiatCurrency: FiatCurrency,
    paymentMethod: string
  ): Promise<any | null> {
    try {
      const bestBuyRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency,
          paymentMethod,
          rateType: RateType.BUY,
        },
        orderBy: [{ rawRate: "asc" }, { fetchedAt: "desc" }],
      });

      const bestSellRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency,
          paymentMethod,
          rateType: RateType.SELL,
        },
        orderBy: [{ rawRate: "desc" }, { fetchedAt: "desc" }],
      });

      return {
        exchange: "Binance",
        currencyPair: `USDT_${fiatCurrency}`,
        paymentMethod,
        bestBuy: bestBuyRate?.adjustedRate ?? bestBuyRate?.rawRate ?? null,
        bestSell: bestSellRate?.adjustedRate ?? bestSellRate?.rawRate ?? null,
        rawBuyRate: bestBuyRate?.rawRate ?? null,
        rawSellRate: bestSellRate?.rawRate ?? null,
        buyLimits: {
          min: bestBuyRate?.minLimit?.toString() ?? null,
          max: bestBuyRate?.maxLimit?.toString() ?? null,
          available: bestBuyRate?.volumeAvailable?.toString() ?? null,
        },
        sellLimits: {
          min: bestSellRate?.minLimit?.toString() ?? null,
          max: bestSellRate?.maxLimit?.toString() ?? null,
          available: bestSellRate?.volumeAvailable?.toString() ?? null,
        },
        fetchedAt: bestBuyRate?.fetchedAt ?? bestSellRate?.fetchedAt ?? null,
      };
    } catch (error) {
      console.error("Error fetching best rates from DB:", error);
      return null;
    }
  }

  /**
   * Fetches the best USDT/KES rates for the specified payment method.
   * @param req - The request object containing user information.
   * @param res - The response object used to send the result back to the client.
   * @returns The best rates for USDT/KES or an error message.
   */
  public getUSDTKESWithMpesaKenyaRates = async (
    req: Request,
    res: Response
  ) => {
    const paymentMethod = KenyaPaymentMethod.MPesaKenya;
    const rates = await this.getBestRatesFromDB(
      FiatCurrency.KES,
      paymentMethod
    );
    if (rates) {
      res.status(200).json(rates);
    } else {
      res.status(500).json({
        error: `Failed to fetch USDT/KES rates for ${paymentMethod}.`,
      });
    }
  };

  /**
   * Fetches the best USDT/ETB rates for the specified payment method.
   * @param req - The request object containing user information.
   * @param res - The response object used to send the result back to the client.
   * @returns The best rates for USDT/ETB or an error message.
   */
  public getUSDTETBWithTeleBirrRates = async (req: Request, res: Response) => {
    const paymentMethod = EthiopiaPaymentMethod.TeleBirr;
    const rates = await this.getBestRatesFromDB(
      FiatCurrency.ETB,
      paymentMethod
    );
    if (rates) {
      res.status(200).json(rates);
    } else {
      res.status(500).json({
        error: `Failed to fetch USDT/ETB rates for ${paymentMethod}.`,
      });
    }
  };

  private routes(): void {
    this.router.get("/usdt-kes", this.getUSDTKESWithMpesaKenyaRates);
    this.router.get("/usdt-etb/:telebirr", this.getUSDTETBWithTeleBirrRates);
  }
}
