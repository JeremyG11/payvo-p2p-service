import {
  PrismaClient,
  Cbe,
  PaymentMethodCategory,
  FiatCurrency,
} from '@prisma/client';
import { Request } from 'express';
import { BadRequestError } from '@/lib/error';
import { AddCbePaymentMethodSchema } from '@/schema/payment-methods';
import { PaymentMethodHandler } from '@/controllers/payments/base';

/**
 * Handler for CBE bank account payment method.
 */
export class CBEHandler extends PaymentMethodHandler {
  constructor(prismaClient: PrismaClient) {
    super(prismaClient);
  }

  async addAccount(req: Request, userId: string): Promise<Cbe> {
    const validatedData = AddCbePaymentMethodSchema.safeParse(req.body);

    if (!validatedData.success) {
      throw new BadRequestError('Invalid input data');
    }
    const { isDefault, accountNumber, accountName } = validatedData.data;

    const supportedMethod = await this.prisma.supportedPaymentMethod.findFirst({
      where: {
        category: PaymentMethodCategory.BANK_TRANSFER,
        currency: FiatCurrency.ETB,
        isActive: true,
      },
    });

    if (!supportedMethod) {
      throw new BadRequestError('CBE is not currently supported');
    }

    const existingAccount = await this.prisma.cbe.findUnique({
      where: { accountNumber },
    });

    if (existingAccount) {
      throw new BadRequestError('This account number is already registered');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.handleIsDefault(tx, userId, isDefault);

      const userPaymentMethod = await tx.userPaymentMethod.create({
        data: {
          userId,
          supportedPaymentMethodId: supportedMethod.id,
          isDefault,
          details: {
            accountName,
            accountNumber,
          },
        },
      });

      return tx.cbe.create({
        data: {
          id: userPaymentMethod.id,
          accountNumber,
          accountName,
        },
        include: {
          userPaymentMethod: { include: { supportedPaymentMethod: true } },
        },
      });
    });
  }

  async getAccounts(userId: string): Promise<Cbe[]> {
    return this.prisma.cbe.findMany({
      where: { userPaymentMethod: { userId } },
      include: {
        userPaymentMethod: { include: { supportedPaymentMethod: true } },
      },
    });
  }

  async updateAccount(
    accountId: string,
    data: Partial<Cbe>
  ): Promise<Cbe | null> {
    const { accountNumber, accountName } = data;
    const updateData: Partial<Cbe> = {};

    if (accountNumber) {
      const existingAccount = await this.prisma.cbe.findUnique({
        where: { accountNumber },
      });
      if (existingAccount && existingAccount.id !== accountId) {
        throw new BadRequestError('This account number is already registered');
      }
      updateData.accountNumber = accountNumber;
    }
    if (accountName) {
      updateData.accountName = accountName;
    }
    if (Object.keys(updateData).length === 0) return null;

    return this.prisma.cbe.update({
      where: { id: accountId },
      data: updateData,
    });
  }
}
