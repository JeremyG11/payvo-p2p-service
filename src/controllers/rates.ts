import { Request, Response, Router } from "express";
import {
  EthiopiaPaymentMethod,
  FiatCurrency,
  KenyaPaymentMethod,
  PrismaClient,
  RateType,
} from "@prisma/client";
import {
  AppError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from "@/lib/error";
import { asyncWrapper } from "@/middlewares/error";

/**
 * A helper type for supported payment methods
 */
export type TSupportedPaymentMethod =
  | KenyaPaymentMethod
  | EthiopiaPaymentMethod;

/**
 * Controller for handling exchange rate-related API requests.
 * All methods now use the asyncWrapper and custom AppErrors.
 */
export class RateController {
  public router: Router;
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.router = Router();
    this.routes();
  }

  /**
   * Fetches the best buy and sell rates for a specific fiat currency and payment method.
   * This is a private helper to centralize the core logic, improving reusability.
   *
   * @param fiatCurrency - The fiat currency (e.g., FiatCurrency.KES).
   * @param paymentMethodName - The name of the payment method (e.g., "MPesaKenya").
   * @returns An object containing the best rates and limits.
   * @throws {NotFoundError} if no rates are found for the given criteria.
   * @throws {InternalServerError} for any unexpected database errors.
   */
  private async getBestRates(
    fiatCurrency: FiatCurrency,
    paymentMethodName: TSupportedPaymentMethod
  ): Promise<any> {
    try {
      /**
       * Find the ID of the supported payment method
       * Throws NotFoundError if the method doesn't exist
       * in the database for the specified fiat currency.
       */
      const supportedMethod =
        await this.prisma.supportedPaymentMethod.findUnique({
          where: {
            name_currency: {
              name: paymentMethodName,
              currency: fiatCurrency,
            },
          },
        });

      if (!supportedMethod) {
        throw new NotFoundError(
          `Payment method '${paymentMethodName}' not found for currency '${fiatCurrency}'.`
        );
      }

      const paymentMethodId = supportedMethod.id;

      /**
       * Query the best buy and sell rates from the database.
       * I define a common where clause to avoid repetition.
       */
      const whereClause = {
        fiatCurrency,
        paymentMethodId,
      };

      /**
       * Fetch the best buy rate (lowest rate)
       * Note: Using 'asc' to get the lowest rate first
       */
      const bestBuyRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          ...whereClause,
          rateType: RateType.BUY,
        },
        orderBy: [{ rawRate: "asc" }, { fetchedAt: "desc" }],
      });

      /**
       * Fetch the best sell rate (highest rate)
       * Note: Using 'desc' to get the highest rate first
       */
      const bestSellRate = await this.prisma.fiatCryptoRate.findFirst({
        where: {
          ...whereClause,
          rateType: RateType.SELL,
        },
        orderBy: [{ rawRate: "desc" }, { fetchedAt: "desc" }],
      });

      if (!bestBuyRate && !bestSellRate) {
        throw new NotFoundError(
          `No rates found for ${fiatCurrency} with ${paymentMethodName}.`
        );
      }

      return {
        source: "Binance",
        currencyPair: `USDT_${fiatCurrency}`,
        paymentMethod: paymentMethodName,
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
      if (error instanceof AppError) {
        throw error;
      }
      console.error("Error fetching best rates from DB:", error);
      throw new InternalServerError(
        "Failed to fetch rates due to a server error."
      );
    }
  }

  /**
   * Fetches the best USDT rates for a specified fiat currency and payment method.
   * This combines the logic of the previous two separate routes into one generic endpoint.
   *
   * @param req - The request object. Expects 'fiatCurrency' and 'paymentMethod' as parameters.
   * @param res - The response object.
   */
  public getBestRatesForPair = async (req: Request, res: Response) => {
    const { fiatCurrency, paymentMethod } = req.params;
    const currency = (fiatCurrency as string).toUpperCase() as FiatCurrency;

    // Validate if the currency is supported
    if (!Object.values(FiatCurrency).includes(currency)) {
      throw new BadRequestError(`Invalid currency: ${fiatCurrency}`);
    }

    const allPaymentMethods = {
      ...KenyaPaymentMethod,
      ...EthiopiaPaymentMethod,
    };
    if (
      !Object.values(allPaymentMethods).includes(
        paymentMethod as TSupportedPaymentMethod
      )
    ) {
      throw new BadRequestError(`Invalid payment method: ${paymentMethod}`);
    }

    const rates = await this.getBestRates(
      currency,
      paymentMethod as TSupportedPaymentMethod
    );
    res.status(200).json(rates);
  };

  /**
   * Fetches *all* rates for a given fiat currency.
   * This method has been updated to use the custom BadRequestError.
   */
  public getRatesByCurrency = async (req: Request, res: Response) => {
    const { fiatCurrency } = req.params;
    const currency = (fiatCurrency as string).toUpperCase() as FiatCurrency;

    if (!Object.values(FiatCurrency).includes(currency)) {
      throw new BadRequestError(`Invalid currency: ${fiatCurrency}`);
    }

    try {
      const rates = await this.prisma.fiatCryptoRate.findMany({
        where: { fiatCurrency: currency },
        orderBy: [{ fetchedAt: "desc" }],
      });
      res.status(200).json(rates);
    } catch (error) {
      console.error("Error fetching all rates by currency:", error);
      throw new InternalServerError(`Failed to fetch rates for ${currency}.`);
    }
  };

  /**
   * Defines all the API routes for the controller.
   * The new routes are cleaner and more dynamic.
   */
  private routes(): void {
    /**
     *  Route to get best rates for any supported pair and payment method
     *  @example: GET /rates/usdt/kes/mpesakenya
     */
    this.router.get(
      "/usdt/:fiatCurrency/:paymentMethod",
      asyncWrapper(this.getBestRatesForPair)
    );

    /**
     *  Route to get all rates for a specific fiat currency
     *  @example: GET /rates/kes
     */
    this.router.get("/:fiatCurrency", asyncWrapper(this.getRatesByCurrency));
  }
}
