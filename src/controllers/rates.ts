import { Request, Response, Router } from 'express';
import { FiatCurrency, PrismaClient, AdType } from '@prisma/client';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from '@/lib/error';
import { asyncWrapper } from '@/middlewares/error';
import { rateConfigs } from '@/config/rate.config';

// Define a type for the expected response from getBestRates
interface BestRateResponse {
  source: string;
  currencyPair: string;
  paymentMethod: string;
  bestBuy: string | null;
  bestSell: string | null;
  rawBuyRate: string | null;
  rawSellRate: string | null;
  buyLimits: {
    min: string | null;
    max: string | null;
    available: string | null;
  };
  sellLimits: {
    min: string | null;
    max: string | null;
    available: string | null;
  };
  fetchedAt: Date | null;
}

/**
 * Controller for handling exchange rate-related API requests.
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
   *
   * @param fiatCurrency - The fiat currency (e.g., FiatCurrency.KES).
   * @param paymentMethodProvider - The name of the payment method (e.g., "MPesaKenya").
   * @returns An object containing the best rates and limits.
   * @throws {NotFoundError} if no rates are found for the given criteria.
   * @throws {InternalServerError} for any unexpected database errors.
   */
  private async getBestRates(
    fiatCurrency: FiatCurrency,
    paymentMethodProvider: string
  ): Promise<BestRateResponse> {
    const supportedMethod = await this.prisma.supportedPaymentMethod.findUnique(
      {
        where: {
          provider_currency: {
            provider: paymentMethodProvider,
            currency: fiatCurrency,
          },
        },
      }
    );

    if (!supportedMethod) {
      throw new NotFoundError(
        `Payment method '${paymentMethodProvider}' not found for currency '${fiatCurrency}'.`
      );
    }

    const paymentMethodId = supportedMethod.id;

    // Use Promise.all to fetch buy and sell rates concurrently
    const [bestBuyRate, bestSellRate] = await Promise.all([
      this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency,
          supportedPaymentMethodId: paymentMethodId,
          adType: AdType.BUY,
        },
        orderBy: [{ rawRate: 'asc' }, { fetchedAt: 'desc' }],
      }),
      this.prisma.fiatCryptoRate.findFirst({
        where: {
          fiatCurrency,
          supportedPaymentMethodId: paymentMethodId,
          adType: AdType.SELL,
        },
        orderBy: [{ rawRate: 'desc' }, { fetchedAt: 'desc' }],
      }),
    ]);

    if (!bestBuyRate && !bestSellRate) {
      throw new NotFoundError(
        `No rates found for ${fiatCurrency} with ${paymentMethodProvider}.`
      );
    }

    return {
      source: 'Binance',
      currencyPair: `USDT_${fiatCurrency}`,
      paymentMethod: paymentMethodProvider,
      bestBuy: bestBuyRate?.toString() ?? null,
      bestSell: bestSellRate?.toString() ?? null,
      rawBuyRate: bestBuyRate?.rawRate?.toString() ?? null,
      rawSellRate: bestSellRate?.rawRate?.toString() ?? null,
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
  }

  /**
   * Fetches the best USDT rates for a specified fiat currency and payment method.
   *
   * @param req - The request object. Expects 'fiatCurrency' and 'paymentMethod' as parameters.
   * @param res - The response object.
   */
  public getBestRatesForPair = async (req: Request, res: Response) => {
    const { fiatCurrency, paymentMethod } = req.params;
    const currency = (fiatCurrency as string).toUpperCase() as FiatCurrency;

    // Get all supported payment method providers from the centralized configuration
    const allSupportedProviders = rateConfigs.flatMap((config) =>
      config.paymentMethods.map((method) => method.provider)
    );

    if (!Object.values(FiatCurrency).includes(currency)) {
      throw new BadRequestError(`Invalid currency: ${fiatCurrency}`);
    }

    if (
      !allSupportedProviders.includes(paymentMethod)
    ) {
      throw new BadRequestError(`Invalid payment method: ${paymentMethod}`);
    }

    const rates = await this.getBestRates(
      currency,
      paymentMethod
    );

    res.status(200).json(rates);
  };

  /**
   * Fetches *all* rates for a given fiat currency.
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
        orderBy: [{ fetchedAt: 'desc' }],
      });
      res.status(200).json(rates);
    } catch (error) {
      // Catch any unexpected database errors and return a 500
      throw new InternalServerError(`Failed to fetch rates for ${currency}.`);
    }
  };

  /**
   * Defines all the API routes for the controller.
   */
  private routes(): void {
    /**
     * Route to get best rates for any supported pair and payment method
     * @example: GET /rates/usdt/kes/mpesakenya
     */
    this.router.get(
      '/usdt/:fiatCurrency/:paymentMethod',
      asyncWrapper(this.getBestRatesForPair)
    );

    /**
     * Route to get all rates for a specific fiat currency
     * @example: GET /rates/kes
     */
    this.router.get('/:fiatCurrency', asyncWrapper(this.getRatesByCurrency));
  }
}
