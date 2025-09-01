import { z } from "zod";
import { PrismaClient, AdStatus, OrderStatus, Prisma } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/lib/error";
import {
  UpdateAdSchema,
  TCreateAd,
  CreateAdSchema,
} from "@/schema/ads";
import { Decimal } from "@prisma/client/runtime/library";
import { AdRepository } from "./ads.repository";

export class AdsService {
  private repo: AdRepository;

  constructor(private prisma: PrismaClient) {
    this.repo = new AdRepository(prisma);
  }

  // A reusable, private helper to validate rates
  private async validateRate(fiatCryptoRateId: string) {
    const rate = await this.prisma.fiatCryptoRate.findUnique({
      where: { id: fiatCryptoRateId, isActive: true },
    });

    if (!rate) {
      throw new BadRequestError("Invalid or inactive rate");
    }

    if (!!rate.expiresAt && rate.expiresAt < new Date()) {
      throw new BadRequestError("Rate expired");
    }

    return rate;
  }

  // A reusable, private helper to validate payment methods
  private async validatePaymentMethods(paymentMethods: string[]) {
    const supportedPaymentMethods =
      await this.prisma.supportedPaymentMethod.findMany({
        where: {
          id: { in: paymentMethods },
          isActive: true,
        },
      });

    if (supportedPaymentMethods.length !== paymentMethods.length) {
      throw new BadRequestError(
        "One or more payment methods are invalid or inactive"
      );
    }
    return supportedPaymentMethods;
  }

  async getAds() {
    return this.prisma.ad.findMany({
      where: {
        status: AdStatus.ACTIVE,
      },
      include: {
        fiatCryptoRate: true,
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  async getMyAds(agentId: string) {
    return this.prisma.ad.findMany({
      where: { agentId },
      include: {
        fiatCryptoRate: true,
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  async createAd(agentId: string, adData: TCreateAd) {
    const validatedAdPayload = CreateAdSchema.safeParse(adData);

    if (!validatedAdPayload.success) {
      throw new BadRequestError("Invalid ad data", {
        details: validatedAdPayload.error.issues,
      });
    }

    const {
      adId,
      paymentMethods,
      minLimitFiat,
      maxLimitFiat,
      fiatCryptoRateId,
      availableAmount,
      title,
      terms,
    } = validatedAdPayload.data;

    // Use Promise.all to run non-dependent queries in parallel
    const [rate, duplicateAd, supportedPaymentMethods] = await Promise.all([
      this.validateRate(fiatCryptoRateId),
      this.prisma.ad.findFirst({
        where: {
          agentId,
          fiatCryptoRateId,
          status: AdStatus.ACTIVE,
        },
      }),
      this.validatePaymentMethods(paymentMethods),
    ]);

    if (duplicateAd) {
      throw new BadRequestError("An active ad for this rate already exists");
    }

    return this.prisma.ad.create({
      data: {
        agent: { connect: { id: agentId } },
        fiatCryptoRate: { connect: { id: fiatCryptoRateId } },
        adId,
        terms,
        minLimitFiat: new Decimal(minLimitFiat),
        maxLimitFiat: new Decimal(maxLimitFiat),
        availableAmount: new Decimal(availableAmount),
        acceptedPaymentMethods: {
          create: supportedPaymentMethods.map((pm) => ({
            paymentMethod: { connect: { id: pm.id } },
          })),
        },
      },
      include: {
        fiatCryptoRate: true,
        agent: { select: { id: true, userId: true, rating: true } },
        acceptedPaymentMethods: { include: { paymentMethod: true } },
      },
    });
  }

  async updateAd(
    adId: string,
    agentId: string,
    updateData: z.infer<typeof UpdateAdSchema>
  ) {
    const ad = await this.repo.findForAgent(adId, agentId);

    if (!ad) {
      throw new NotFoundError("Ad not found");
    }

    // Check for active orders using the DRY repository method
    if (await this.repo.hasActiveOrders(adId)) {
      throw new BadRequestError("Cannot update ad with active orders");
    }

    // Prepare data for update
    const dataToUpdate: Prisma.AdUpdateInput = {};

    if (updateData.title) dataToUpdate.title = updateData.title;
    if (updateData.terms) dataToUpdate.terms = updateData.terms;
    if (updateData.isOnline !== undefined)
      dataToUpdate.status = updateData.isOnline
        ? AdStatus.ACTIVE
        : AdStatus.PAUSED;
    if (updateData.status) dataToUpdate.status = updateData.status;

    // Handle minLimit and maxLimit separately for Decimal conversion
    if (updateData.minLimitFiat) {
      dataToUpdate.minLimitFiat = new Decimal(updateData.minLimitFiat);
    }
    if (updateData.maxLimitFiat) {
      dataToUpdate.maxLimitFiat = new Decimal(updateData.maxLimitFiat);
    }

    // If payment methods are being updated, handle the join table
    if (updateData.paymentMethods) {
      const supportedPaymentMethods = await this.validatePaymentMethods(
        updateData.paymentMethods
      );
      dataToUpdate.acceptedPaymentMethods = {
        deleteMany: {},
        create: supportedPaymentMethods.map((pm) => ({
          paymentMethod: { connect: { id: pm.id } },
        })),
      };
    }

    return this.repo.update(adId, dataToUpdate);
  }

  async deleteAd(adId: string, agentId: string) {
    const ad = await this.repo.findForAgent(adId, agentId);
    if (!ad) {
      throw new NotFoundError("Ad not found");
    }

    if (await this.repo.hasActiveOrders(adId)) {
      throw new BadRequestError("Cannot delete ad with active orders");
    }

    return this.repo.delete(adId);
  }

  async getAdStatsForAgent(agentId: string) {
    // This is a common pattern for aggregates. It's clean and readable.
    const completedOrders = await this.prisma.ad.aggregate({
      where: {
        agentId,
        orders: {
          some: {
            status: OrderStatus.COMPLETED,
          },
        },
      },
      _count: true,
    });

    const activeOrders = await this.prisma.ad.aggregate({
      where: {
        agentId,
        orders: {
          some: {
            status: {
              in: [
                OrderStatus.PENDING_AGENT_CONFIRMATION,
                OrderStatus.AGENT_ACCEPTED,
                OrderStatus.PROCESSING,
              ],
            },
          },
        },
      },
      _count: true,
    });

    return {
      completedAds: completedOrders._count,
      activeAds: activeOrders._count,
    };
  }

  async getActiveAdsForAgent(agentId: string) {
    return this.prisma.ad.findMany({
      where: {
        agentId,
        status: AdStatus.ACTIVE,
        // isOnline: true, // You can add this back if you have it on your Ad model
        fiatCryptoRate: {
          expiresAt: { gt: new Date() },
        },
      },
      include: {
        fiatCryptoRate: true,
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  async updateAdAvailableAmount(
    adId: string,
    amount: Decimal,
    operation: "increment" | "decrement" = "decrement"
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ad = await tx.ad.findUnique({
        where: { id: adId },
      });

      if (!ad) {
        throw new NotFoundError("Ad not found");
      }

      const currentAmount = new Decimal(ad.availableAmount);
      let newAmount: Decimal;
      let newStatus: AdStatus = ad.status;

      if (operation === "decrement") {
        if (currentAmount.lessThan(amount)) {
          throw new BadRequestError("Insufficient available amount on ad");
        }
        newAmount = currentAmount.minus(amount);
        if (newAmount.isZero()) {
          newStatus = AdStatus.EXPIRED;
        }
      } else {
        newAmount = currentAmount.plus(amount);
        if (ad.status === AdStatus.EXPIRED) {
          newStatus = AdStatus.ACTIVE;
        }
      }

      return tx.ad.update({
        where: { id: adId },
        data: {
          availableAmount: newAmount,
          status: newStatus,
        },
      });
    });
  }
}
