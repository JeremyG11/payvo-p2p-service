import { PrismaClient, Prisma, AdStatus, OrderStatus } from "@prisma/client";
import { NotFoundError } from "@/lib/error";
import { Decimal } from "@prisma/client/runtime/library";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export class AdRepository {
  constructor(private prisma: PrismaClient) {}

  findById(adId: string) {
    return this.prisma.ad.findUnique({
      where: { id: adId },
      include: {
        fiatCryptoRate: true,
        agent: {
          select: {
            id: true,
            userId: true,
            rating: true,
            completedOrders: true,
          },
        },
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  findForAgent(adId: string, agentId: string) {
    return this.prisma.ad.findFirst({
      where: { id: adId, agentId },
      include: { fiatCryptoRate: true },
    });
  }
  /**
   * Find ad by ID and lock for update (within a transaction)
   */
  async findByIdForUpdate(adId: string, tx?: PrismaClient) {
    const client = tx ?? this.prisma;
    return client.ad.findUnique({
      where: { id: adId },
      // Locking for update is supported in Prisma only for some databases (e.g., PostgreSQL)
      // If using PostgreSQL, you can use a raw query for SELECT ... FOR UPDATE
    });
  }

  async createAd(data: Prisma.AdCreateInput) {
    // A separate method to handle the complexities of the join table
    const paymentMethods =
      data.acceptedPaymentMethods as Prisma.AdsOnPaymentMethodsCreateManyAdInput[];
    const adData = {
      ...data,
      acceptedPaymentMethods: {
        createMany: {
          data: paymentMethods.map((pm) => ({
            paymentMethodId: pm.paymentMethodId,
          })),
        },
      },
    };

    return this.prisma.ad.create({
      data: adData,
      include: {
        fiatCryptoRate: true,
        agent: {
          select: {
            id: true,
            userId: true,
            rating: true,
          },
        },
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  findMany(where: Prisma.AdWhereInput, page: number, limit: number) {
    return this.prisma.ad.findMany({
      where,
      include: {
        fiatCryptoRate: true,
        agent: {
          select: {
            id: true,
            userId: true,
            rating: true,
            completedOrders: true,
          },
        },
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
      orderBy: { fiatCryptoRate: { rawRate: "desc" } },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  count(where: Prisma.AdWhereInput) {
    return this.prisma.ad.count({ where });
  }

  async update(adId: string, data: Prisma.AdUpdateInput) {
    return this.prisma.ad.update({
      where: { id: adId },
      data,
      include: {
        fiatCryptoRate: true,
        agent: {
          select: {
            id: true,
            userId: true,
            rating: true,
          },
        },
        acceptedPaymentMethods: {
          include: {
            paymentMethod: true,
          },
        },
      },
    });
  }

  async delete(adId: string) {
    // Deleting the join table entries first to prevent foreign key constraint errors
    await this.prisma.adsOnPaymentMethods.deleteMany({
      where: { adId },
    });

    return this.prisma.ad.delete({
      where: { id: adId },
      include: { fiatCryptoRate: true },
    });
  }

  async hasActiveOrders(adId: string) {
    return this.prisma.order
      .count({
        where: {
          adId,
          status: {
            in: [
              OrderStatus.PENDING_AGENT_CONFIRMATION,
              OrderStatus.AGENT_ACCEPTED,
              OrderStatus.PROCESSING,
            ],
          },
        },
      })
      .then((count) => count > 0);
  }

  // No changes required for transaction-related methods as they remain generic
  async updateAvailableAmount(
    tx: TransactionClient,
    adId: string,
    newAmount: Decimal,
    newStatus: AdStatus
  ) {
    return tx.ad.update({
      where: { id: adId },
      data: {
        availableAmount: newAmount.toString(),
        status: newStatus,
      },
    });
  }

  async incrementAvailableAmount(
    tx: TransactionClient,
    adId: string,
    amount: Decimal
  ) {
    const ad = await tx.ad.findUnique({
      where: { id: adId },
      select: { availableAmount: true, status: true },
    });

    if (!ad) {
      throw new NotFoundError("Ad not found");
    }

    const currentAmount = new Decimal(ad.availableAmount);
    const newAmount = currentAmount.plus(amount);

    return tx.ad.update({
      where: { id: adId },
      data: {
        availableAmount: newAmount.toString(),
        status: AdStatus.ACTIVE,
      },
    });
  }
}
