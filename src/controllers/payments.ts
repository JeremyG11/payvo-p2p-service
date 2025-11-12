import { AppError, BadRequestError, UnauthenticatedError } from '@/lib/error';
import { logger } from '@/lib/logger';
import { authenticate } from '@/middlewares/authenticate';
import { authorize } from '@/middlewares/authorize';
import { asyncWrapper } from '@/middlewares/error';
import validator from '@/middlewares/validator';
import { CurrencyParamSchema, QueryParamsSchema } from '@/schema';

import {
  AddCbePaymentMethodSchema,
  AddMPesaKenyaSchema,
  AddPaymentMethodQueryParamsSchema,
  AddTeleBirrSchema,
} from '@/schema/payment-methods';
import {
  Prisma,
  PrismaClient,
  FiatCurrency,
  type MPesaKenya,
  type Cbe,
  type TeleBirr,
  type UserPaymentMethod,
  type SupportedPaymentMethod,
  PaymentMethodCategory,
} from '@prisma/client';

import { Router } from 'express';
import type { Request, Response } from 'express';

/**
 * Interface for a standardized API response.
 * @template T The type of the data returned in the response.
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Custom Request type to ensure userId is present after authentication middleware.
 */
interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * The unified type for all payment accounts (MPesa, CBE, TeleBirr).
 */
type PaymentAccount = MPesaKenya | Cbe | TeleBirr;

/**
 * The unified type for user payment method details, including the linked account.
 */
type UserPaymentMethodDetails = UserPaymentMethod & {
  mpesaKenya: MPesaKenya;
  cbe: Cbe | null;
  telebirr: TeleBirr | null;
};

/**
 * Abstract base class for handling different payment methods.
 */
abstract class PaymentMethodHandler {
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

/**
 * Handler for MPesa Kenya payment method.
 */
class MPesaKenyaHandler extends PaymentMethodHandler {
  async addAccount(req: Request, userId: string): Promise<MPesaKenya> {
    const validatedData = AddMPesaKenyaSchema.safeParse(req.body);

    if (!validatedData.success) {
      throw new BadRequestError(
        validatedData.error.issues.map((issue) => issue.message).join(', ')
      );
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
        `This ${existingAccount.displayName} account is already registered`
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

/**
 * Handler for CBE bank account payment method.
 */
class CBEHandler extends PaymentMethodHandler {
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

/**
 * Handler for TeleBirr payment method.
 */
class TeleBirrHandler extends PaymentMethodHandler {
  async addAccount(req: Request, userId: string): Promise<TeleBirr> {
    const validatedData = AddTeleBirrSchema.safeParse(req.body);

    if (!validatedData.success) {
      throw new BadRequestError(
        validatedData.error.issues.map((issue) => issue.message).join(', ')
      );
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
        `This ${existingAccount.displayName} account is already registered`
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

/**
 * The main controller for handling all payment-related API requests.
 */
export class PaymentController {
  private prisma: PrismaClient;
  private handlers: Map<string, PaymentMethodHandler>;

  /**
   * @param {PrismaClient} prismaClient The Prisma client instance.
   */
  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.handlers = new Map();
    this.handlers.set('mpesakenya', new MPesaKenyaHandler(prismaClient));
    this.handlers.set('cbe', new CBEHandler(prismaClient));
    this.handlers.set('telebirr', new TeleBirrHandler(prismaClient));
  }

  /**
   * Extracts the userId from the request object.
   * @param {AuthenticatedRequest} req The Express request object.
   * @returns {string} The user's ID.
   * @throws {UnauthenticatedError} If the userId is not present.
   */
  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.userId;
    if (!userId) {
      throw new UnauthenticatedError('Authentication required');
    }
    return userId;
  }

  /**
   * Retrieves the appropriate payment method handler.
   * @param {string} methodName The name of the payment method.
   * @returns {PaymentMethodHandler} The payment method handler instance.
   * @throws {BadRequestError} If the payment method is not supported.
   */
  private getHandler(methodName: string): PaymentMethodHandler {
    const handler = this.handlers.get(methodName.toLowerCase());
    if (!handler) {
      throw new BadRequestError(`Unsupported payment method: ${methodName}`);
    }
    return handler;
  }

  /**
   * Sends a standardized success response.
   * @template T The type of the data to include.
   * @param {Response} res The Express response object.
   * @param {T} [data] The data to send.
   * @param {string} [message] A success message.
   */
  private sendSuccess<T>(res: Response, data?: T, message?: string): void {
    const response: ApiResponse<T> = { success: true, data, message };
    res.status(200).json(response);
  }

  /**
   * Gets all supported payment methods.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async getAllSupportedPaymentMethods(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const methods: Pick<
        SupportedPaymentMethod,
        'id' | 'currency' | 'displayName'
      >[] = await this.prisma.supportedPaymentMethod.findMany({
        where: { isActive: true },
        select: {
          id: true,
          category: true,
          provider: true,
          currency: true,
          displayName: true,
        },
      });

      this.sendSuccess(
        res,
        methods,
        'Supported payment methods retrieved successfully'
      );
    } catch (error) {
      logger.error('Error fetching supported payment methods', error);
      throw error;
    }
  }

  /**
   * Adds a new payment method account.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async addPaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      logger.debug('Adding payment method with request body:', req.params);
      const userId = this.getUserId(req);
      const validatedData = AddPaymentMethodQueryParamsSchema.safeParse(
        req.params
      );

      if (!validatedData.success) {
        throw new BadRequestError('Invalid request parameters');
      }

      const { methodName } = validatedData.data;

      const handler = this.getHandler(methodName);
      const account = await handler.addAccount(req, userId);
      this.sendSuccess(
        res,
        account,
        `${methodName} account added successfully`
      );
    } catch (error) {
      logger.debug(error);
      throw error;
    }
  }

  /**
   * Retrieves a user's payment accounts for a specific method.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async getPaymentMethods(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);

      const validatedData = AddPaymentMethodQueryParamsSchema.safeParse(
        req.params
      );

      if (!validatedData.success) {
        throw new BadRequestError('Invalid request parameters');
      }

      const { methodName } = validatedData.data;

      const handler = this.getHandler(methodName);
      const accounts = await handler.getAccounts(userId);
      this.sendSuccess(
        res,
        accounts,
        `${methodName} accounts retrieved successfully`
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves supported payment methods filtered by currency.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async getSupportedPaymentMethodsByCurrency(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const validatedData = CurrencyParamSchema.safeParse(req.params);

      if (!validatedData.success) {
        throw new BadRequestError('Invalid currency format');
      }

      const { fiatCurrency } = validatedData.data;
      const currency = fiatCurrency.toUpperCase() as FiatCurrency;

      if (!Object.values(FiatCurrency).includes(currency)) {
        throw new BadRequestError(
          `Invalid or Unsupported currency: ${fiatCurrency}`
        );
      }

      const paymentMethods = await this.prisma.supportedPaymentMethod.findMany({
        where: {
          currency,
          isActive: true,
        },
      });

      this.sendSuccess(
        res,
        paymentMethods,
        'Payment methods retrieved successfully'
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves all payment methods for a specific user.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */

  async getUserPaymentMethods(req: Request, res: Response): Promise<void> {
    try {
      this.getUserId(req);

      const { userId } = req.params;

      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      // Query for user payment methods and include the supported method type
      const accounts = await this.prisma.userPaymentMethod.findMany({
        where: { userId },
        include: {
          supportedPaymentMethod: true,
          mpesaKenya: {
            select: {
              phoneNumber: true,
              accountName: true,
            },
          },
          cbe: {
            select: {
              accountName: true,
              accountNumber: true,
            },
          },
          telebirr: {
            select: {
              phoneNumber: true,
              accountName: true,
            },
          },
        },
      });

      // Map the results to the desired structure
      const formattedAccounts = accounts.map((account) => {
        const userSpecificDetails =
          account.telebirr || account.cbe || account.mpesaKenya;

        return {
          id: account.id,
          userId: account.userId,
          supportedPaymentMethodId: account.supportedPaymentMethod.id,
          provider: account.supportedPaymentMethod.provider,
          category: account.supportedPaymentMethod.category,
          displayName: account.supportedPaymentMethod.displayName,
          currency: account.supportedPaymentMethod.currency,
          details: {
            ...userSpecificDetails,
          },
          isDefault: account.isDefault,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        };
      });

      this.sendSuccess(
        res,
        formattedAccounts,
        'User payment methods retrieved'
      );
    } catch (error) {
      throw error;
    }
  }
  /**
   * Updates a specific payment method account.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async updatePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);

      const { paymentMethodId } = req.params;
      const { isDefault, ...details } = req.body;

      const paymentMethod = await this.prisma.userPaymentMethod.findFirst({
        where: { id: paymentMethodId, userId },
        include: {
          supportedPaymentMethod: true,
          mpesaKenya: true,
          cbe: true,
          telebirr: true,
        },
      });

      if (!paymentMethod) {
        throw new BadRequestError('Payment method not found');
      }

      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(details).length > 0) {
          if (paymentMethod.mpesaKenya) {
            await this.getHandler('mpesakenya').updateAccount(
              paymentMethod.id,
              details as Partial<MPesaKenya>
            );
          } else if (paymentMethod.cbe) {
            await this.getHandler('cbe').updateAccount(
              paymentMethod.id,
              details as Partial<Cbe>
            );
          } else if (paymentMethod.telebirr) {
            await this.getHandler('telebirr').updateAccount(
              paymentMethod.id,
              details as Partial<TeleBirr>
            );
          }
        }

        if (typeof isDefault === 'boolean') {
          if (isDefault) {
            await tx.userPaymentMethod.updateMany({
              where: { userId, isDefault: true },
              data: { isDefault: false },
            });
          }
          await tx.userPaymentMethod.update({
            where: { id: paymentMethodId },
            data: { isDefault },
          });
        }
      });

      this.sendSuccess(res, null, 'Payment method updated successfully');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Deletes a user's payment method.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   */
  async deletePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { paymentMethodId } = req.params;

      const paymentMethod = await this.prisma.userPaymentMethod.findFirst({
        where: { id: paymentMethodId, userId },
      });

      if (!paymentMethod) {
        throw new BadRequestError('Payment method not found');
      }

      await this.prisma.userPaymentMethod.delete({
        where: { id: paymentMethodId },
      });

      this.sendSuccess(res, null, 'Payment method deleted successfully');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Defines and returns the Express router for payment-related endpoints.
   * @returns {Router} The Express router instance.
   */
  routes(): Router {
    const router = Router();
    router.get(
      '/',
      asyncWrapper(this.getAllSupportedPaymentMethods.bind(this))
    );

    router.post(
      '/methods/:methodName',
      validator(AddPaymentMethodQueryParamsSchema, 'params'),
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:create'] }),
      asyncWrapper(this.addPaymentMethod.bind(this))
    );
    router.get(
      '/methods/:methodName',
      asyncWrapper(this.getPaymentMethods.bind(this))
    );

    router.get(
      '/users/:userId/methods',
      authenticate,
      asyncWrapper(this.getUserPaymentMethods.bind(this))
    );

    router.get(
      '/currency/:fiatCurrency',
      validator(CurrencyParamSchema, 'params'),
      asyncWrapper(this.getSupportedPaymentMethodsByCurrency.bind(this))
    );
    router.put(
      '/methods/:paymentMethodId',
      validator(QueryParamsSchema, 'params'),
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:update'] }),
      asyncWrapper(this.updatePaymentMethod.bind(this))
    );

    router.delete(
      '/methods/:paymentMethodId',
      validator(QueryParamsSchema, 'params'),
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:delete'] }),
      asyncWrapper(this.deletePaymentMethod.bind(this))
    );

    return router;
  }
}
