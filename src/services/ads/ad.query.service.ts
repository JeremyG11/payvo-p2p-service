import {
  PrismaClient,
  AdStatus,
  Prisma,
  AdType,
  CryptoCurrency,
  FiatCurrency,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '@/lib/logger';
import { NotFoundError } from '@/lib/error';
import {
  BinanceP2PAdSynchronizer,
  type ProcessedAd,
} from '@/services/rates/binance';
import { rateCalculator } from '../rates/calculation/rate-calculator';

/**
 * The AdQueryService handles all business logic related to fetching, filtering,
 * and aggregating ad data. It includes complex market rate calculations and
 * data transformation for client-side display.
 */
export class AdQueryService {
  private prisma: PrismaClient;
  private readonly binanceService: BinanceP2PAdSynchronizer;
  private rateCalculator = rateCalculator;

  constructor(prisma: PrismaClient, binanceService: BinanceP2PAdSynchronizer) {
    this.prisma = prisma;
    this.binanceService = binanceService;
    this.rateCalculator = rateCalculator;
  }

  /**
   * Fetches a paginated list of all ads, optionally filtered by status.
   * @param options Pagination and filtering options.
   * @returns An object containing the ads, total count, and pagination info.
   */
  async getAllAds(options: {
    page?: number;
    limit?: number;
    status?: AdStatus;
  }) {
    const { page = 1, limit = 10, status } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.AdWhereInput = {};
    if (status) {
      where.status = status;
    }

    const ads = await this.prisma.ad.findMany({
      skip,
      take: limit,
      where,
      include: {
        agent: true,
      },
    });

    const totalCount = await this.prisma.ad.count({ where });

    return {
      ads,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  /**
   * Retrieves a single ad by its ID.
   * @param adId The ID of the ad to fetch.
   * @returns The ad object with its associated agent.
   * @throws {NotFoundError} if the ad does not exist.
   */
  async getAdById(adId: string) {
    const ad = await this.prisma.ad.findUnique({
      where: { id: adId },
      include: {
        agent: true,
      },
    });

    if (!ad) {
      throw new NotFoundError('Ad not found.');
    }

    return ad;
  }

  /**
   * Fetches ads along with their associated agent and user details.
   * This is a complex aggregation query that includes calculating market rates (VWAP),
   * rate deviation, and performing a market safety check (auto-pausing).
   *
   * @param options Filtering and pagination options, including status, currency, and payment providers.
   * @returns An object containing the transformed list of agents/ads, total count, and pagination info.
   */
  async getAdWithAgent(options: {
    page?: number;
    limit?: number;
    status?: AdStatus;
    fromCurrency?: string;
    toCurrency?: string;
    pmProviders?: string[];
  }) {
    const {
      page = 1,
      limit = 10,
      status,
      fromCurrency,
      toCurrency,
      pmProviders = [],
    } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.AdWhereInput = {
      status: status || AdStatus.ACTIVE,
      ...(fromCurrency && { fromCurrency: fromCurrency as FiatCurrency }),
      ...(toCurrency && { toCurrency: toCurrency as FiatCurrency }),
      ...(pmProviders.length > 0 && {
        acceptedPaymentMethods: {
          some: {
            paymentMethod: {
              supportedPaymentMethod: {
                provider: { in: pmProviders },
              },
            },
          },
        },
      }),
    };

    const totalCount = await this.prisma.ad.count({ where });

    const ads = await this.prisma.ad.findMany({
      skip,
      take: limit,
      where,
      include: {
        agent: true,
        acceptedPaymentMethods: {
          include: {
            paymentMethod: {
              include: {
                supportedPaymentMethod: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fiatTypes = Array.from(new Set(ads.map((a) => a.fiatCurrency)));
    const adTypes = Array.from(new Set(ads.map((a) => a.adType)));
    const binanceRates: Record<string, Decimal> = {};

    for (const fiat of fiatTypes) {
      for (const adType of adTypes) {
        const bAds: ProcessedAd[] =
          await this.binanceService.getAdsForRateCalculation(
            fiat as any,
            CryptoCurrency.USDT,
            adType as any,
            20
          );
        binanceRates[`${fiat}-${adType}`] =
          this.rateCalculator.calculateVolumeWeightedRate(bAds);
      }
    }

    const agents = ads.map((ad) => {
      const agent = ad.agent;
      const marketRate =
        binanceRates[`${ad.fiatCurrency}-${ad.adType}`] ||
        new Decimal(ad.unitPrice);
      const adPrice = new Decimal(ad.unitPrice);
      const deviationPercent = marketRate.isZero()
        ? 0
        : adPrice.minus(marketRate).dividedBy(marketRate).times(100).toNumber();

      if (Math.abs(deviationPercent) > 5 && ad.status === AdStatus.ACTIVE) {
        this.prisma.ad
          .update({ where: { id: ad.id }, data: { status: AdStatus.INACTIVE } })
          .catch((err) =>
            logger.error('Failed to auto-pause ad', { adId: ad.id, err })
          );
      }

      return {
        id: ad.id,
        name: agent.name,
        verified: true,
        transactions: agent.totalOrders || 0,
        completionRate: agent.totalOrders
          ? parseFloat(
              ((agent.completedOrders / agent.totalOrders) * 100).toFixed(2)
            )
          : 100,
        positiveRate: parseFloat(agent.rating?.toString() ?? '100'),
        price: adPrice.toNumber(),
        minLimitFiat: ad.minLimitFiat.toNumber(),
        maxLimitFiat: ad.maxLimitFiat.toNumber(),
        fromCurrency: ad.fromCurrency,
        toCurrency: ad.toCurrency,
        adType: ad.adType,
        paymentMethods: ad.acceptedPaymentMethods.map((pm) => ({
          id: pm.paymentMethod.id,
          provider: pm.paymentMethod.supportedPaymentMethod.provider,
          displayName: pm.paymentMethod.supportedPaymentMethod.displayName,
          details: pm.paymentMethod.details,
          currency: pm.paymentMethod.supportedPaymentMethod.currency,
        })),
        deviationPercent,
        online: true,
      };
    });

    return {
      agents,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
