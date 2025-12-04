import { AppError, BadRequestError, UnauthenticatedError } from '@/lib/error';
import { authenticate } from '@/middlewares/authenticate';
import { authorize } from '@/middlewares/authorize';
import { asyncWrapper } from '@/middlewares/error';
import validator from '@/middlewares/validator';
import { CurrencyParamSchema, QueryParamsSchema } from '@/schema';

import {
  PrismaClient,
  FiatCurrency,
  type SupportedPaymentMethod,
  type MPesaKenya,
  type Cbe,
  type TeleBirr,
} from '@/generated/prisma/client';

import { Router, type Request, type Response } from 'express';
import {
  PaymentMethodHandler,
  type ApiResponse,
  type UserPaymentMethodDetails,
} from '@/controllers/payments/base';
import { MPesaKenyaHandler } from '@/controllers/payments/mpesa-kenya';
import { CBEHandler } from '@/controllers/payments/cbe';
import { TeleBirrHandler } from '@/controllers/payments/telebir';
import { logger } from '@/lib/logger';
import { AddPaymentMethodQueryParamsSchema } from '@/schema/payment-methods';

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
    this.handlers.set('mpesa-kenya', new MPesaKenyaHandler(prismaClient));
    this.handlers.set('cbe', new CBEHandler(prismaClient));
    this.handlers.set('telebirr', new TeleBirrHandler(prismaClient));
  }

  /**
   * Extracts the userId from the request object.
   * @param {Request} req The Express request object.
   * @returns {string} The user's ID.
   * @throws {UnauthenticatedError} If the userId is not present.
   */
  private getUserId(req: Request): string {
    const userId = req.userId;

    console.log('Authenticated userId:', userId);
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
      this.getUserId(req);
      const methods: Pick<
        SupportedPaymentMethod,
        'id' | 'currency' | 'displayName'
      >[] = await this.prisma.supportedPaymentMethod.findMany({
        where: { isActive: true },
        select: {
          id: true,
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
      const userId = this.getUserId(req);

      const validatedData = AddPaymentMethodQueryParamsSchema.safeParse(
        req.params
      );
      if (!validatedData.success) {
        throw new BadRequestError('Invalid data ');
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

      const result = AddPaymentMethodQueryParamsSchema.safeParse(req.params);
      if (!result.success) {
        throw new BadRequestError('Invalid request body');
      }

      const { methodName } = result.data;

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
      const result = CurrencyParamSchema.safeParse(req.params);
      if (!result.success) {
        throw new BadRequestError('Invalid currency parameter');
      }
      const { fiatCurrency } = result.data;
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
          mpesaKenya: true,
          cbe: true,
          telebirr: true,
        },
      });

      // Map the results to the desired structure
      const formattedAccounts = accounts.map((account) => {
        const userSpecificDetails =
          account.telebirr || account.cbe || account.mpesaKenya;

        return {
          id: account.id,
          userId: account.userId,
          isDefault: account.isDefault,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          paymentMethod: {
            id: account.supportedPaymentMethod.id,
            type: account.supportedPaymentMethod.category,
            name: account.supportedPaymentMethod.category,
            currency: account.supportedPaymentMethod.currency,
            details: {
              ...userSpecificDetails,
            },
          },
        };
      });

      this.sendSuccess(
        res,
        formattedAccounts,
        'User payment methods retrieved'
      );
    } catch (error) {
      throw new AppError('Failed to retrieve user payment methods', 500);
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
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:create'] }),
      validator(AddPaymentMethodQueryParamsSchema, 'params'),
      asyncWrapper(this.addPaymentMethod.bind(this))
    );
    router.get(
      '/methods/:methodName',
      authenticate,
      validator(AddPaymentMethodQueryParamsSchema, 'params'),
      asyncWrapper(this.getPaymentMethods.bind(this))
    );

    router.get(
      '/users/:userId/methods',
      authenticate,
      asyncWrapper(this.getUserPaymentMethods.bind(this))
    );

    router.get(
      '/currency/:fiatCurrency',
      asyncWrapper(this.getSupportedPaymentMethodsByCurrency.bind(this))
    );
    router.put(
      '/methods/:paymentMethodId',
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:update'] }),
      validator(QueryParamsSchema, 'params'),
      asyncWrapper(this.updatePaymentMethod.bind(this))
    );

    router.delete(
      '/methods/:paymentMethodId',
      authenticate,
      authorize({ requiredPermissions: ['payment:methods:delete'] }),
      validator(QueryParamsSchema, 'params'),
      asyncWrapper(this.deletePaymentMethod.bind(this))
    );

    return router;
  }
}
