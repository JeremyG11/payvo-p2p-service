import {
  Prisma,
  PrismaClient,
  FiatCurrency,
  PaymentMethodType,
} from "@prisma/client";
import { Router, Request, Response } from "express";

/**
 * Controller for managing user payment methods and accounts.
 *
 * Handles CRUD operations for different payment methods (e.g., MPESA, CBE Bank),
 * including adding, retrieving, updating, and deleting payment accounts.
 * Supports filtering by currency and setting default payment methods.
 *
 * Methods:
 * - addMPesa: Add a new MPESA mobile money account for the authenticated user.
 * - getMPesaAccounts: Retrieve all MPESA accounts for the authenticated user.
 * - addCBE: Add a new CBE Bank account for the authenticated user.
 * - getCBEAccounts: Retrieve all CBE Bank accounts for the authenticated user.
 * - getPaymentMethodsByCurrency: Get payment accounts filtered by fiat currency.
 * - updatePaymentMethod: Update details or default status of a payment method.
 * - deletePaymentMethod: Remove a payment method and its associated account.
 * - routes: Returns an Express router with all payment-related endpoints.
 *
 * All endpoints require authentication and expect a valid user ID.
 *
 * @remarks
 * This controller uses Prisma ORM for database operations and expects
 * Express Request and Response objects for handling HTTP requests.
 *
 * @example
 * const paymentController = new PaymentController(prismaClient);
 * app.use('/payments', paymentController.routes());
 */
export class PaymentController {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  private handleError(res: Response, error: any, context: string) {
    console.error(`${context} error:`, error);
    const message = error?.message ?? "Internal Server Error";
    res.status(500).json({ message: `${context} failed: ${message}` });
  }

  private async addPaymentAccount<T>(
    req: Request,
    res: Response,
    paymentMethodType: PaymentMethodType,
    createNested: (
      tx: Prisma.TransactionClient,
      userId: string,
      data: any,
      isDefault: boolean
    ) => Promise<T>
  ): Promise<void> {
    try {
      const userId = (req as any).userId as string;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { isDefault = false, ...details } = req.body;

      const existingCount = await this.prisma.userPaymentMethod.count({
        where: { userId },
      });
      const markDefault = isDefault || existingCount === 0;

      if (markDefault && existingCount > 0) {
        await this.prisma.userPaymentMethod.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const account = await this.prisma.$transaction((tx) =>
        createNested(tx, userId, details, markDefault)
      );

      res.status(201).json({
        account,
        message: `${paymentMethodType} account added successfully.`,
      });
    } catch (error) {
      this.handleError(res, error, `add${paymentMethodType}`);
    }
  }

  /**
   * Fetches the best buy and sell rates for a given fiat currency and payment method from the database.
   * @param fiatCurrency - The fiat currency to filter rates by (e.g., "KES").
   * @param paymentMethod - The payment method to filter rates by (e.g., "MPesaKenya").
   * @returns An object containing the best buy and sell rates, limits, and other details,
   *          or null if no rates are found or an error occurs.
   */
  private async getPaymentAccounts<T>(
    req: Request,
    res: Response,
    findMany: (userId: string) => Promise<T[]>
  ): Promise<void> {
    try {
      const userId = (req as any).userId as string;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const items = await findMany(userId);
      res.status(200).json(items);
    } catch (error) {
      this.handleError(res, error, "getPaymentAccounts");
    }
  }

  /**
   * Adds a new MPesa payment account for the authenticated user.
   * @param req - The request object containing user information and account details.
   * @param res - The response object used to send the result back to the client.
   */
  async addMPesa(req: Request, res: Response): Promise<void> {
    await this.addPaymentAccount(
      req,
      res,
      PaymentMethodType.MOBILE_MONEY,
      async (tx, userId, details, isDefault) => {
        return tx.paymentAccount.create({
          data: {
            userId,
            type: PaymentMethodType.MOBILE_MONEY,
            currency: FiatCurrency.KES,
            details: { phoneNumber: details.phoneNumber },
            mpesaKenya: { create: { phoneNumber: details.phoneNumber } },
            userLinks: { create: { userId, isDefault } },
          },
          include: { mpesaKenya: true, userLinks: true },
        });
      }
    );
  }

  /**
   * Retrieves all MPesa accounts for the authenticated user.
   * @param req - The request object containing user information.
   * @param res - The response object used to send the result back to the client.
   */
  async getMPesaAccounts(req: Request, res: Response): Promise<void> {
    await this.getPaymentAccounts(req, res, async (userId) => {
      return this.prisma.paymentAccount.findMany({
        where: { userId, type: PaymentMethodType.MOBILE_MONEY },
        include: { userLinks: true, mpesaKenya: true },
      });
    });
  }

  /**
   * Adds a new CBE Bank account for the authenticated user.
   * @param req - The request object containing user information and account details.
   * @param res - The response object used to send the result back to the client.
   */
  async addCBE(req: Request, res: Response): Promise<void> {
    await this.addPaymentAccount(
      req,
      res,
      PaymentMethodType.BANK_ACCOUNT,
      async (tx, userId, details, isDefault) => {
        return tx.paymentAccount.create({
          data: {
            userId,
            type: PaymentMethodType.BANK_ACCOUNT,
            currency: FiatCurrency.ETB,
            details: { accountNumber: details.accountNumber },
            cbe: { create: { accountNumber: details.accountNumber } },
            userLinks: { create: { userId, isDefault } },
          },
          include: { cbe: true, userLinks: true },
        });
      }
    );
  }

  /**
   * Retrieves all CBE Bank accounts for the authenticated user.
   * @param req - The request object containing user information.
   * @param res - The response object used to send the result back to the client.
   */
  async getCBEAccounts(req: Request, res: Response): Promise<void> {
    await this.getPaymentAccounts(req, res, async (userId) => {
      return this.prisma.paymentAccount.findMany({
        where: { userId, type: PaymentMethodType.BANK_ACCOUNT },
        include: { userLinks: true, cbe: true },
      });
    });
  }

  /**
   * Retrieves all payment methods for a given fiat currency.
   * @param req - The request object containing user information and currency.
   * @param res - The response object used to send the result back to the client.
   */
  async getPaymentMethodsByCurrency(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = (req as any).userId as string;
      const { fiatCurrency } = req.params;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const currency = (fiatCurrency as string).toUpperCase() as FiatCurrency;
      if (!Object.values(FiatCurrency).includes(currency)) {
        res.status(400).json({ message: `Invalid currency: ${fiatCurrency}` });
        return;
      }

      const accounts = await this.prisma.paymentAccount.findMany({
        where: { userId, currency },
        include: { userLinks: true },
      });

      res.status(200).json(accounts);
    } catch (error) {
      this.handleError(res, error, "getPaymentMethodsByCurrency");
    }
  }

  /**
   * Updates an existing payment method for the authenticated user.
   * @param req - The request object containing user information and updated payment method details.
   * @param res - The response object used to send the result back to the client.
   */
  async updatePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId as string;
      const { paymentMethodId } = req.params;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { isDefault, phoneNumber, accountNumber } = req.body;

      const link = await this.prisma.userPaymentMethod.findUnique({
        where: { id: paymentMethodId },
        include: { account: true },
      });
      if (!link || link.userId !== userId) {
        res.status(404).json({ message: "Payment method not found." });
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        const detailUpdates: Record<string, any> = {};
        if (phoneNumber) detailUpdates.phoneNumber = phoneNumber;
        if (accountNumber) detailUpdates.accountNumber = accountNumber;
        if (Object.keys(detailUpdates).length) {
          await tx.paymentAccount.update({
            where: { id: link.paymentAccountId },
            data: { details: detailUpdates },
          });
        }

        if (
          link.account.type === PaymentMethodType.MOBILE_MONEY &&
          phoneNumber
        ) {
          await tx.mPesaKenya.update({
            where: { accountId: link.paymentAccountId },
            data: { phoneNumber },
          });
        }
        if (
          link.account.type === PaymentMethodType.BANK_ACCOUNT &&
          accountNumber
        ) {
          await tx.cBE.update({
            where: { accountId: link.paymentAccountId },
            data: { accountNumber },
          });
        }

        if (typeof isDefault === "boolean") {
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

      res.status(200).json({ message: "Payment method updated successfully." });
    } catch (error) {
      this.handleError(res, error, "updatePaymentMethod");
    }
  }

  /**
   * Deletes a payment method for the authenticated user.
   * @param req - The request object containing user information and payment method ID.
   * @param res - The response object used to send the result back to the client.
   */
  async deletePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { paymentMethodId } = req.params;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const link = await this.prisma.userPaymentMethod.findUnique({
        where: { id: paymentMethodId },
      });
      if (!link || link.userId !== userId) {
        res.status(404).json({ message: "Payment method not found." });
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.userPaymentMethod.delete({ where: { id: paymentMethodId } });
        await tx.paymentAccount.delete({
          where: { id: link.paymentAccountId },
        });
      });

      res.status(200).json({ message: "Payment method deleted successfully." });
    } catch (error) {
      this.handleError(res, error, "deletePaymentMethod");
    }
  }

  /**
   * Sets up the routes for the payment methods.
   * @returns The router instance with the defined routes.
   */
  routes(): Router {
    const router = Router();
    router.get("/", this.getPaymentMethodsByCurrency.bind(this));

    router.post("/mpesa-kenya", this.addMPesa.bind(this));
    router.get("/mpesa-kenya", this.getMPesaAccounts.bind(this));

    router.post("/cbe", this.addCBE.bind(this));
    router.get("/cbe", this.getCBEAccounts.bind(this));

    router.get("/:fiatCurrency", this.getPaymentMethodsByCurrency.bind(this));
    router.put("/:paymentMethodId", this.updatePaymentMethod.bind(this));
    router.delete("/:paymentMethodId", this.deletePaymentMethod.bind(this));
    return router;
  }
}
