import { PrismaClient, AdStatus, Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/lib/error';
import { TCreateAd, CreateAdSchema, TUpdateAd } from '@/schema/ads';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * The AdsService class handles all business logic related to ads.
 * It's separated from the controller to promote a clear separation of concerns.
 * This makes the codebase more maintainable and easier to test.
 */
export class AdsService {
  constructor(private prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Validates the provided fiat/crypto rate and ensures it's active.
   * This is a utility method to keep the main function clean.
   */
  private async validateRate(fiatCryptoRateId: string) {
    const rate = await this.prisma.fiatCryptoRate.findUnique({
      where: { id: fiatCryptoRateId, isActive: true },
    });

    if (!rate) {
      throw new BadRequestError('Invalid or inactive rate');
    }

    return rate;
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
   * This method is the core business logic for ad creation.
   */
  async createAd(userId: string, adData: TCreateAd) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    /**
     * Validate the incoming ad data schema upfront
     * This ensures that all required fields are present and correctly formatted.
     */
    const validatedAdPayload = CreateAdSchema.safeParse(adData);
    if (!validatedAdPayload.success) {
      throw new BadRequestError('Invalid ad data', {
        details: validatedAdPayload.error.issues,
      });
    }

    const {
      paymentMethods,
      minLimitFiat,
      maxLimitFiat,
      fiatCryptoRateId,
      availableAmount,
      terms = '',
    } = validatedAdPayload.data;

    /**
     * Perform all necessary checks in parallel to improve performance.
     * This includes fetching the agent, validating the rate, checking for duplicate ads,
     * and validating payment methods simultaneously.
     */
    const [agent, rate, duplicateAd, agentPaymentMethods] = await Promise.all([
      this.prisma.agent.findUnique({
        where: { userId },
      }),
      this.validateRate(fiatCryptoRateId),
      this.prisma.ad.findFirst({
        where: {
          agent: { userId },
          fiatCryptoRateId,
          status: AdStatus.ACTIVE,
        },
      }),
      this.validatePaymentMethods(paymentMethods, userId),
    ]);

    // Perform all necessary checks after the concurrent lookups are complete.
    if (!agent) {
      throw new BadRequestError('Agent not found');
    }

    if (duplicateAd) {
      throw new BadRequestError('An active ad for this rate already exists');
    }

    // Create the new ad and its associated payment methods in a single atomic operation.
    const newAd = await this.prisma.ad.create({
      data: {
        advNo: rate.advNo,
        agent: { connect: { id: agent.id } },
        fiatCryptoRate: { connect: { id: rate.id } },
        terms,
        minLimitFiat: new Decimal(minLimitFiat),
        maxLimitFiat: new Decimal(maxLimitFiat),
        availableAmount: new Decimal(availableAmount),
        acceptedPaymentMethods: {
          create: agentPaymentMethods.paymentMethods.map((pm) => ({
            paymentMethod: { connect: { id: pm.id } },
          })),
        },
      },
    });

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
        // P2025 is Prisma's error code for a record not being found
        if (e.code === 'P2025') {
          throw new NotFoundError('Ad not found.');
        }
      }
      // Re-throw any other errors
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
