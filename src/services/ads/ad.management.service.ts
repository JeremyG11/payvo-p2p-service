import {
  PrismaClient,
  AdStatus,
  Prisma,
  AdType,
} from '@/generated/prisma/client';
import Decimal from 'decimal.js';
import { logger } from '@/lib/logger';
import { type TCreateAd, CreateAdSchema } from '@/schema/ads';
import { RateService } from '@/services/rates/calculation';
import { BadRequestError, NotFoundError } from '@/lib/error';
import { generateAdId } from '@/services/rates/utils/id-generator';

/**
 * The AdManagementService handles all core business logic related to
 * creating, updating, and deleting classified ads.
 * It ensures data integrity, performs necessary validations (like payment methods),
 * and fetches external data (like market rates) required for ad creation.
 */
export class AdManagementService {
  private prisma: PrismaClient;
  private rateService: RateService;

  constructor(prisma: PrismaClient, rateService: RateService) {
    this.prisma = prisma;
    this.rateService = rateService;
  }

  /**
   * Validates the provided payment methods against the user's registered methods.
   * It ensures all provided payment methods are active and belong to the user.
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
   * @param userId The ID of the user creating the ad.
   * @param adData The validated data for the new ad.
   * @param adType The type of the ad (BUY or SELL).
   * @returns The newly created ad object with its associated payment methods.
   */
  async createAd(userId: string, adData: TCreateAd, adType: AdType) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    // 1. Validate the incoming ad data
    const validatedAdPayload = CreateAdSchema.safeParse(adData);
    if (!validatedAdPayload.success) {
      throw new BadRequestError(
        'Invalid ad data',
        validatedAdPayload.error.issues
      );
    }

    const { paymentMethods, minLimitFiat, maxLimitFiat, ...rest } =
      validatedAdPayload.data;

    const advNo = await generateAdId();

    // 2. Check user status and active ads
    const [agent, existingActiveAd] = await Promise.all([
      this.prisma.agent.findUnique({
        where: { userId },
      }),
      this.prisma.ad.findFirst({
        where: {
          agent: { userId },
          status: AdStatus.ACTIVE,
          fiatCurrency: rest.fromCurrency,
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

    // Create the new ad
    const newAd = await this.prisma.ad.create({
      data: {
        advNo,
        agent: { connect: { id: agent.id } },
        paymentTimeout: rest.paymentTimeout,
        terms: rest?.terms,
        minLimitFiat: new Decimal(minLimitFiat),
        maxLimitFiat: new Decimal(maxLimitFiat),
        unitPrice: new Decimal(rest.unitPrice),
        fiatCurrency: rest.fromCurrency,
        fromCurrency: rest.fromCurrency,
        toCurrency: rest.toCurrency,
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
      };

      if (paymentMethods) {
        // Validation of payment methods is critical during update as well
        const existingAd = await this.prisma.ad.findUnique({
          where: { id: adId },
          select: { agent: { select: { userId: true } } },
        });
        if (!existingAd || !existingAd.agent.userId) {
          throw new NotFoundError('Ad or associated agent not found.');
        }

        const agentPaymentMethods = await this.validatePaymentMethods(
          paymentMethods,
          existingAd.agent.userId
        );

        dataToUpdate.acceptedPaymentMethods = {
          set: agentPaymentMethods.paymentMethods.map((pm) => ({
            adId_paymentMethodId: {
              adId: adId,
              paymentMethodId: pm.id,
            },
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
}
