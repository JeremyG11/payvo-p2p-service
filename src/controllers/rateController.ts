import { Request, Response, Router } from "express";
import { PrismaClient, RateType } from "@prisma/client";

export class RateController {
  private prisma: PrismaClient;
  public router: Router;

  constructor() {
    this.prisma = new PrismaClient();
    this.router = Router();
    this.routes();
  }

  private async getBestRatesFromDB(
    fiatCurrency: string,
    paymentMethod: string
  ): Promise<any | null> {
    try {
      const bestBuyRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency: fiatCurrency,
          paymentMethod: paymentMethod,
          rateType: RateType.BUY,
        },
        orderBy: {
          rawRate: "asc",
          fetchedAt: "desc",
        },
      });

      const bestSellRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency: fiatCurrency,
          paymentMethod: paymentMethod,
          rateType: RateType.SELL,
        },
        orderBy: {
          rawRate: "desc",
          fetchedAt: "desc",
        },
      });

      return {
        exchange: "Binance",
        currencyPair: `USDT_${fiatCurrency}`,
        paymentMethod: paymentMethod,
        bestBuy: bestBuyRate?.adjustedRate || bestBuyRate?.rawRate || null,
        bestSell: bestSellRate?.adjustedRate || bestSellRate?.rawRate || null,
        rawBuyRate: bestBuyRate?.rawRate || null,
        rawSellRate: bestSellRate?.rawRate || null,
        buyLimits: {
          min: bestBuyRate?.minLimit?.toString() || null,
          max: bestBuyRate?.maxLimit?.toString() || null,
          available: bestBuyRate?.volumeAvailable?.toString() || null,
        },
        sellLimits: {
          min: bestSellRate?.minLimit?.toString() || null,
          max: bestSellRate?.maxLimit?.toString() || null,
          available: bestSellRate?.volumeAvailable?.toString() || null,
        },
        fetchedAt: bestBuyRate?.fetchedAt || bestSellRate?.fetchedAt || null,
      };
    } catch (error) {
      console.error("Error fetching best rates from DB:", error);
      return null;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  public getUSDTKESRates = async (req: Request, res: Response) => {
    const paymentMethod = "MPesaKenya";
    const rates = await this.getBestRatesFromDB("KES", paymentMethod);
    if (rates) {
      res.status(200).json(rates);
    } else {
      res.status(500).json({
        error: `Failed to fetch USDT/KES rates for ${paymentMethod}.`,
      });
    }
  };

  public getUSDTETBRates = async (req: Request, res: Response) => {
    const paymentMethod = "TeleBirr";
    const rates = await this.getBestRatesFromDB("ETB", paymentMethod);
    if (rates) {
      res.status(200).json(rates);
    } else {
      res.status(500).json({
        error: `Failed to fetch USDT/ETB rates for ${paymentMethod}.`,
      });
    }
  };

  private routes(): void {
    this.router.get("/usdt-kes", this.getUSDTKESRates);
    this.router.get("/usdt-etb", this.getUSDTETBRates);
  }
}
