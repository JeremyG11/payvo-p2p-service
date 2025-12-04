import {
  PrismaClient,
  type TeleBirr,
  PaymentMethodCategory,
  FiatCurrency,
} from '@/generated/prisma/client';
import type { Request } from 'express';
import { BadRequestError } from '@/lib/error';
import { AddTeleBirrSchema } from '@/schema/payment-methods';
import { PaymentMethodHandler } from '@/controllers/payments/base';

/**
 * Handler for TeleBirr payment method.
 */
export class TeleBirrHandler extends PaymentMethodHandler {
  constructor(prismaClient: PrismaClient) {
    super(prismaClient);
  }

  async addAccount(req: Request, userId: string): Promise<TeleBirr> {
    const validatedData = AddTeleBirrSchema.safeParse(req.body);

    if (!validatedData.success) {
      throw new BadRequestError('Invalid request data');
    }
    const { phoneNumber } = validatedData.data;

    const { isDefault = false } = req.body;

    const supportedMethod = await this.prisma.supportedPaymentMethod.findFirst({
      where: {
        category: PaymentMethodCategory.MOBILE_MONEY,
        currency: FiatCurrency.ETB,
        isActive: true,
      },
    });

    if (!supportedMethod) {
      throw new BadRequestError('TeleBirr is not currently supported');
    }

    const existingAccount = await this.prisma.teleBirr.findUnique({
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

      return tx.teleBirr.create({
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

  async getAccounts(userId: string): Promise<TeleBirr[]> {
    return this.prisma.teleBirr.findMany({
      where: { userPaymentMethod: { userId } },
      include: {
        userPaymentMethod: { include: { supportedPaymentMethod: true } },
      },
    });
  }

  async updateAccount(
    accountId: string,
    data: Partial<TeleBirr>
  ): Promise<TeleBirr | null> {
    const { phoneNumber, accountName } = data;
    const updateData: Partial<TeleBirr> = {};

    if (phoneNumber) {
      const existingAccount = await this.prisma.teleBirr.findUnique({
        where: { phoneNumber },
      });
      if (existingAccount && existingAccount.id !== accountId) {
        throw new BadRequestError(
          `This ${existingAccount.displayName} account is already registered`
        );
      }
      updateData.phoneNumber = phoneNumber;
    }
    if (accountName) {
      updateData.accountName = accountName;
    }
    if (Object.keys(updateData).length === 0) return null;

    return this.prisma.teleBirr.update({
      where: { id: accountId },
      data: updateData,
    });
  }
}
