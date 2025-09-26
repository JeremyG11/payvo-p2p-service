import {
  PrismaClient,
  AdStatus,
  Prisma,
  CryptoCurrency,
  AdType,
} from '@prisma/client';
import { BadRequestError, NotFoundError, ValidationError } from '@/lib/error';
import { TCreateAd, CreateAdSchema } from '@/schema/ads';
import { logger } from '@/lib/logger';
import { RateService } from '@/services/rates/calculation';
import Decimal from 'decimal.js';
import { generateAdId } from '@/services/rates/utils/id-generator';
import { hashCacheService } from '@/config/radis';
import { getAllActiveUsers } from '@/lib/utils/active-user';

/**
 * The AdsService class handles all business logic related to ads.
 * It's separated from the controller to promote a clear separation of concerns.
 * This makes the codebase more maintainable and easier to test.
 */
export class AdsService {
  private prisma: PrismaClient;
  private rateService: RateService;

  constructor(prisma: PrismaClient, rateService: RateService) {
    this.prisma = prisma;
    this.rateService = rateService;
  }

  /**
   * Validates the provided payment methods against the user's registered methods.
   * It also ensures all provided payment methods belong to the user.
   */
  private async validatePaymentMethods(
    paymentMethodIds: string[],
    userId: string
  ): Promise<{
    paymentMethods: { id: string; userId: string; displayName: string }[];
  }> {
    const agentPaymentMethods = await this.prisma.userPaymentMethod.findMany({
      where: {
        userId,
        id: { in: paymentMethodIds },
      },
      include: {
        supportedPaymentMethod: {
          select: {
            currency: true,
            category: true,
            provider: true,
            displayName: true,
          },
        },
      },
    });

    if (agentPaymentMethods.length !== paymentMethodIds.length) {
      throw new BadRequestError(
        'One or more payment methods are invalid, inactive, or do not belong to you'
      );
    }

    return {
      paymentMethods: agentPaymentMethods.map((pm) => ({
        id: pm.id,
        userId: pm.userId,
        displayName: pm.supportedPaymentMethod.displayName,
      })),
    };
  }

  /**
   * Creates a new ad after performing all necessary validations.
   */
  async createAd(userId: string, adData: TCreateAd, adType: AdType) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    // Validate the incoming ad data
    const validatedAdPayload = CreateAdSchema.safeParse(adData);
    if (!validatedAdPayload.success) {
      throw new ValidationError(
        'Invalid ad data',
        JSON.stringify({ details: validatedAdPayload.error.issues })
      );
    }

    const {
      fiatCurrency,
      paymentMethods,
      minLimitFiat,
      unitPrice,
      maxLimitFiat,
      availableAmount,
      ...rest
    } = validatedAdPayload.data;

    const advNo = await generateAdId();

    // Check if user is an agent and if they have an active ad
    const [agent, existingActiveAd] = await Promise.all([
      this.prisma.agent.findUnique({
        where: { userId },
      }),
      this.prisma.ad.findFirst({
        where: {
          agent: { userId },
          status: AdStatus.ACTIVE,
          fiatCurrency,
          adType,
        },
      }),
    ]);

    if (!agent) {
      throw new BadRequestError('Agent not found');
    }

    if (existingActiveAd) {
      throw new BadRequestError(
        'An active ad for this currency and type already exists'
      );
    }

    // Validate payment methods
    const agentPaymentMethods = await this.validatePaymentMethods(
      paymentMethods,
      userId
    );

    // Get the current market rate
    let marketRate;
    try {
      marketRate = await this.rateService.getMarketRate({
        fiatCurrency,
        cryptoCurrency: CryptoCurrency.USDT,
        adType,
      });
    } catch (error) {
      logger.error('Failed to get market rate', {
        error,
        fiatCurrency,
        adType,
      });
      throw new BadRequestError(
        'Failed to get market rate. Please try again later.'
      );
    }

    // Create the new ad
    const newAd = await this.prisma.ad.create({
      data: {
        advNo,
        agent: { connect: { id: agent.id } },
        terms: rest?.terms,
        minLimitFiat: new Decimal(minLimitFiat),
        maxLimitFiat: new Decimal(maxLimitFiat),
        availableAmount: new Decimal(availableAmount),
        unitPrice: marketRate.rate,
        fiatCurrency,
        adType,
        status: AdStatus.ACTIVE,
        acceptedPaymentMethods: {
          create: agentPaymentMethods.paymentMethods.map((pm) => ({
            paymentMethod: { connect: { id: pm.id } },
          })),
        },
      },
      include: {
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
    });

    logger.info('Ad created successfully', { adId: newAd.id, userId });

    return newAd;
  }

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
   * Updates an existing ad with the provided data.
   * @param adId The ID of the ad to update.
   * @param adData The data to update the ad with.
   * @returns The updated ad object.
   */
  async updateAd(adId: string, adData: Partial<TCreateAd>) {
    try {
      const { paymentMethods, ...restOfData } = adData;

      const dataToUpdate: Prisma.AdUpdateInput = {
        ...restOfData,
        minLimitFiat: restOfData.minLimitFiat
          ? new Decimal(restOfData.minLimitFiat)
          : undefined,
        maxLimitFiat: restOfData.maxLimitFiat
          ? new Decimal(restOfData.maxLimitFiat)
          : undefined,
        availableAmount: restOfData.availableAmount
          ? new Decimal(restOfData.availableAmount)
          : undefined,
      };

      if (paymentMethods) {
        dataToUpdate.acceptedPaymentMethods = {
          set: paymentMethods.map((id) => ({
            adId_paymentMethodId: { adId, paymentMethodId: id },
          })),
        };
      }

      const updatedAd = await this.prisma.ad.update({
        where: { id: adId },
        data: dataToUpdate,
        include: {
          agent: true,
        },
      });

      return updatedAd;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          throw new NotFoundError('Ad not found.');
        }
      }
      throw e;
    }
  }

  /**
   * Deletes an ad by its ID.
   * @param adId The ID of the ad to delete.
   * @returns A confirmation object.
   */
  async deleteAd(adId: string) {
    try {
      await this.prisma.ad.delete({
        where: { id: adId },
      });
      return { message: 'Ad deleted successfully.' };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          throw new NotFoundError('Ad not found.');
        }
      }
      throw e;
    }
  }

  /**
   * Fetches ads along with their associated agent and user details.
   * Supports pagination and filtering by ad status.
   */
  async getAdWithAgent(options: {
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

    const allActiveUsers = await getAllActiveUsers();

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
    });

    const totalCount = await this.prisma.ad.count({ where });

    const agents = await Promise.all(
      ads.map(async (ad) => {
        const agent = ad.agent;
        const paymentMethod =
          ad.acceptedPaymentMethods[0]?.paymentMethod?.supportedPaymentMethod
            ?.displayName ?? 'N/A';

        const transactions = agent.totalOrders || 0;
        const completed = agent.completedOrders || 0;

        const activeSockets = allActiveUsers[agent.id];
        const isAgentOnline =
          !!activeSockets ||
          !!(await hashCacheService.getField<boolean>(
            'chat:active:users',
            agent.id
          ));
        return {
          id: ad.id,
          name: `Agent-${agent.id}`,
          verified: true,
          transactions,
          completionRate: transactions
            ? parseFloat(((completed / transactions) * 100).toFixed(2))
            : 100,
          positiveRate: parseFloat(agent.rating?.toString?.() ?? '100') || 100,
          price: `${parseFloat(ad.unitPrice.toString()).toFixed(2)} ${
            ad.fiatCurrency
          }`,
          available: `${parseFloat(ad.availableAmount.toString()).toFixed(
            2
          )} USDT`,
          limit: `${parseFloat(
            ad.minLimitFiat.toString()
          ).toLocaleString()} - ${parseFloat(
            ad.maxLimitFiat.toString()
          ).toLocaleString()} ${ad.fiatCurrency}`,
          paymentMethod,
          online: isAgentOnline,
        };
      })
    );

    return {
      agents,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
