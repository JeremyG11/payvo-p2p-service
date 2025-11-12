import {
  type MPesaKenya,
  PaymentMethodCategory,
  FiatCurrency,
  PrismaClient,
} from '@prisma/client';
import type { Request } from 'express';
import { BadRequestError } from '@/lib/error';
import { AddMPesaKenyaSchema } from '@/schema/payment-methods';
import { PaymentMethodHandler } from '@/controllers/payments/base';

/**
 * Handler for MPesa Kenya payment method.
 */
export class MPesaKenyaHandler extends PaymentMethodHandler {
  constructor(prismaClient: PrismaClient) {
    super(prismaClient);
  }

  async addAccount(req: Request, userId: string): Promise<MPesaKenya> {
    const validatedData = AddMPesaKenyaSchema.safeParse(req.body);

    if (!validatedData.success) {
      throw new BadRequestError('Invalid request data');
    }

    const { phoneNumber } = validatedData.data;
    const { isDefault = false } = req.body;

    const supportedMethod = await this.prisma.supportedPaymentMethod.findFirst({
      where: {
        category: PaymentMethodCategory.MOBILE_MONEY,
        currency: FiatCurrency.KES,
        isActive: true,
      },
    });

    if (!supportedMethod) {
      throw new BadRequestError('MPesa Kenya is not currently supported');
    }

    const existingAccount = await this.prisma.mPesaKenya.findUnique({
      where: { phoneNumber },
    });

    if (existingAccount) {
      throw new BadRequestError(
        `This ${supportedMethod.displayName} account is already registered`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.handleIsDefault(tx, userId, isDefault);

      const userPaymentMethod = await tx.userPaymentMethod.create({
        data: {
          userId,
          supportedPaymentMethodId: supportedMethod.id,
          isDefault,
          details: {
            phoneNumber,
          },
        },
      });

      return tx.mPesaKenya.create({
        data: {
          id: userPaymentMethod.id,
          phoneNumber,
        },
        include: {
          userPaymentMethod: { include: { supportedPaymentMethod: true } },
        },
      });
    });
  }

  async getAccounts(userId: string): Promise<MPesaKenya[]> {
    return this.prisma.mPesaKenya.findMany({
      where: { userPaymentMethod: { userId } },
      include: {
        userPaymentMethod: { include: { supportedPaymentMethod: true } },
      },
    });
  }

  async updateAccount(
    accountId: string,
    data: Partial<MPesaKenya>
  ): Promise<MPesaKenya | null> {
    const { phoneNumber } = data;
    if (!phoneNumber) return null;

    const existingAccount = await this.prisma.mPesaKenya.findUnique({
      where: { phoneNumber },
    });

    if (existingAccount && existingAccount.id !== accountId) {
      throw new BadRequestError(
        `This ${existingAccount.displayName} account is already registered`
      );
    }

    return this.prisma.mPesaKenya.update({
      where: { id: accountId },
      data: { phoneNumber },
    });
  }
}
