import type { Request } from 'express';
import {
  Prisma,
  PrismaClient,
  type MPesaKenya,
  type Cbe,
  type TeleBirr,
  type UserPaymentMethod,
} from '@/generated/prisma/client';

/**
 * Interface for a standardized API response.
 * @template T The type of the data returned in the response.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Custom Request type to ensure userId is present after authentication middleware.
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * The unified type for all payment accounts (MPesa, CBE, TeleBirr).
 */
export type PaymentAccount = MPesaKenya | Cbe | TeleBirr;

/**
 * The unified type for user payment method details, including the linked account.
 */
export type UserPaymentMethodDetails = UserPaymentMethod & {
  mpesaKenya: MPesaKenya;
  cbe: Cbe | null;
  telebirr: TeleBirr | null;
};

/**
 * Abstract base class for handling different payment methods.
 */
export abstract class PaymentMethodHandler {
  constructor(protected prisma: PrismaClient) {}

  abstract addAccount(req: Request, userId: string): Promise<PaymentAccount>;

  abstract getAccounts(userId: string): Promise<PaymentAccount[]>;

  abstract updateAccount(
    accountId: string,
    data: Partial<PaymentAccount>
  ): Promise<PaymentAccount | null>;

  protected async handleIsDefault(
    tx: Prisma.TransactionClient,
    userId: string,
    isDefault?: boolean
  ): Promise<void> {
    if (isDefault) {
      await tx.userPaymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
  }
}
