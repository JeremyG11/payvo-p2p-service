import { BasePaymentAccount } from "@/types";
import { Request, Response, Router } from "express";
import { PaymentMethodType, FiatCurrency, PrismaClient } from "@prisma/client";

export class PaymentController {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  private async createUserPaymentMethod(
    userId: string,
    paymentMethodType: PaymentMethodType,
    paymentMethodId: string,
    isDefault: boolean
  ): Promise<object> {
    if (isDefault) {
      await this.prisma.userPaymentMethod.updateMany({
        where: {
          userId,
          NOT: {
            paymentMethodId: paymentMethodId,
          },
        },
        data: {
          isDefault: false,
        },
      });
    }

    return this.prisma.userPaymentMethod.create({
      data: {
        userId,
        paymentMethodType,
        paymentMethodId,
        isDefault,
      },
    });
  }

  private async addPaymentAccount<T extends BasePaymentAccount>(
    req: Request,
    res: Response,
    paymentMethodType: PaymentMethodType,
    createAccount: (userId: string, data: any) => Promise<T>
  ): Promise<void> {
    try {
      const userId = req.userId;
      const { isDefault = false, ...accountData } = req.body;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Basic validation for common required fields based on payment method type
      if (
        (paymentMethodType === PaymentMethodType.MOBILE_MONEY &&
          !accountData.phoneNumber) ||
        (paymentMethodType === PaymentMethodType.BANK_ACCOUNT &&
          !accountData.accountNumber)
      ) {
        res
          .status(400)
          .json({ message: "Required account details are missing." });
        return;
      }

      // Create the specific payment account using the provided callback
      const newAccount: T = await createAccount(userId, accountData);

      // Create the UserPaymentMethod entry to link the user to this new account
      await this.createUserPaymentMethod(
        userId,
        paymentMethodType,
        newAccount.id,
        isDefault
      );

      res.status(201).json({
        account: newAccount,
        message: `${paymentMethodType} account added successfully.`,
      });
    } catch (error: any) {
      console.error(`Error adding ${paymentMethodType} account:`, error);
      res.status(500).json({
        message: error.message || `Could not add ${paymentMethodType} account.`,
      });
    }
  }

  private async getPaymentAccounts<T extends BasePaymentAccount>(
    req: Request,
    res: Response,
    findMany: (userId: string) => Promise<T[]>
  ): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const accounts: T[] = await findMany(userId);
      res.status(200).json(accounts);
    } catch (error: any) {
      console.error("Error getting accounts:", error);
      res
        .status(500)
        .json({ message: error.message || "Could not retrieve accounts." });
    }
  }

  async addMPesa(req: Request, res: Response): Promise<void> {
    await this.addPaymentAccount(
      req,
      res,
      PaymentMethodType.MOBILE_MONEY,
      async (
        userId: string,
        data: { phoneNumber: string; isDefault: boolean }
      ) => {
        // KES for M-Pesa Kenya
        return this.prisma.mPesaKenya.create({
          data: {
            userId,
            phoneNumber: data.phoneNumber,
            isDefault: data.isDefault,
            currency: FiatCurrency.KES,
          },
        });
      }
    );
  }

  async getMPesaAccounts(req: Request, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accounts = await this.prisma.mPesaKenya.findMany({
        where: { userId },
      });
      return res.status(200).json(accounts);
    } catch (error) {
      return res.status(500).json({
        message:
          error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  }

  async addCBE(req: Request, res: Response): Promise<void> {
    await this.addPaymentAccount(
      req,
      res,
      PaymentMethodType.BANK_ACCOUNT,
      async (
        userId: string,
        data: { accountNumber: string; isDefault: boolean }
      ) => {
        // Assume ETB for CBE
        return this.prisma.cBE.create({
          data: {
            userId,
            accountNumber: data.accountNumber,
            isDefault: data.isDefault,
            currency: FiatCurrency.ETB,
          },
        });
      }
    );
  }

  async getCBEAccounts(req: Request, res: Response): Promise<void> {
    await this.getPaymentAccounts(req, res, async (userId: string) => {
      return this.prisma.cBE.findMany({ where: { userId } });
    });
  }

  async getPaymentMethodsByCurrency(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.userId;
      const { fiatCurrency } = req.params;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Validate the currency parameter against the FiatCurrency enum
      const requestedCurrency: FiatCurrency =
        fiatCurrency.toUpperCase() as FiatCurrency;
      if (!Object.values(FiatCurrency).includes(requestedCurrency)) {
        res
          .status(400)
          .json({ message: `Invalid currency specified: ${fiatCurrency}.` });
        return;
      }

      // Fetch all user's payment method entries
      const userPaymentMethods = await this.prisma.userPaymentMethod.findMany({
        where: { userId },
      });

      /** @type {Array<object & { details: BasePaymentAccount }>} */
      const filteredPaymentMethods: Array<
        object & { details: BasePaymentAccount }
      > = [];

      // Iterate through each UserPaymentMethod to fetch detailed account info
      for (const upm of userPaymentMethods) {
        /** @type {BasePaymentAccount | null} */
        let accountDetails: BasePaymentAccount | null = null;

        // Determine the type of payment method and fetch its details
        if (upm.paymentMethodType === PaymentMethodType.MOBILE_MONEY) {
          accountDetails = await this.prisma.mPesaKenya.findUnique({
            where: { id: upm.paymentMethodId },
          });
        } else if (upm.paymentMethodType === PaymentMethodType.BANK_ACCOUNT) {
          accountDetails = await this.prisma.cBE.findUnique({
            where: { id: upm.paymentMethodId },
          });
        }
        // TODO: Add more else if blocks here for other PaymentMethodType as you add them

        // If details are found and currency matches, add to filtered list
        if (accountDetails && accountDetails.currency === requestedCurrency) {
          filteredPaymentMethods.push({ ...upm, details: accountDetails });
        }
      }

      res.status(200).json(filteredPaymentMethods);
    } catch (error: any) {
      console.error("Error getting payment methods by currency:", error);
      res.status(500).json({
        message: error.message || "Could not retrieve payment methods.",
      });
    }
  }

  async updatePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { paymentMethodId } = req.params;
      // Destructure isDefault separately as its handling is special
      const { isDefault, ...updateData } = req.body;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Find the UserPaymentMethod entry to determine the specific payment account type
      const userPaymentMethod = await this.prisma.userPaymentMethod.findUnique({
        where: { id: paymentMethodId, userId },
      });

      if (!userPaymentMethod) {
        res.status(404).json({ message: "Payment method not found." });
        return;
      }

      /** @type {BasePaymentAccount | null} */
      let updatedAccount: BasePaymentAccount | null = null;

      // Update the specific payment account details based on its type
      if (
        userPaymentMethod.paymentMethodType === PaymentMethodType.MOBILE_MONEY
      ) {
        updatedAccount = await this.prisma.mPesaKenya.update({
          where: { id: userPaymentMethod.paymentMethodId },
          data: updateData, // Apply updates to M-Pesa specific fields
        });
      } else if (
        userPaymentMethod.paymentMethodType === PaymentMethodType.BANK_ACCOUNT
      ) {
        updatedAccount = await this.prisma.cBE.update({
          where: { id: userPaymentMethod.paymentMethodId },
          data: updateData, // Apply updates to CBE specific fields
        });
      }
      // TODO: Add more else if blocks for other PaymentMethodType as you add them

      if (!updatedAccount) {
        // This case should ideally not be reached if userPaymentMethod exists and is valid
        res
          .status(404)
          .json({ message: "Specific account details not found." });
        return;
      }

      // If `isDefault` was provided in the request body, update the default status
      if (typeof isDefault === "boolean") {
        // Re-use createUserPaymentMethod to handle setting/unsetting default status
        await this.createUserPaymentMethod(
          userId,
          userPaymentMethod.paymentMethodType,
          userPaymentMethod.paymentMethodId,
          isDefault
        );
      }

      res.status(200).json({
        message: "Payment method updated successfully.",
        updatedAccount,
      });
    } catch (error: any) {
      console.error("Error updating payment method:", error);
      res.status(500).json({
        message: error.message || "Could not update payment method.",
      });
    }
  }

  async deletePaymentMethod(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { paymentMethodId } = req.params;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      // Find the UserPaymentMethod entry to determine the type and ID of the specific account
      const userPaymentMethod = await this.prisma.userPaymentMethod.findUnique({
        where: { id: paymentMethodId, userId },
      });

      if (!userPaymentMethod) {
        res.status(404).json({ message: "Payment method not found." });
        return;
      }

      // Delete the specific payment account first
      if (
        userPaymentMethod.paymentMethodType === PaymentMethodType.MOBILE_MONEY
      ) {
        await this.prisma.mPesaKenya.delete({
          where: { id: userPaymentMethod.paymentMethodId },
        });
      } else if (
        userPaymentMethod.paymentMethodType === PaymentMethodType.BANK_ACCOUNT
      ) {
        await this.prisma.cBE.delete({
          where: { id: userPaymentMethod.paymentMethodId },
        });
      }
      // TODO: Add more else if blocks for other PaymentMethodType as you add them

      // Then delete the UserPaymentMethod entry itself
      await this.prisma.userPaymentMethod.delete({
        where: { id: paymentMethodId },
      });

      res.status(200).json({ message: "Payment method deleted successfully." });
    } catch (error: any) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({
        message: error.message || "Could not delete payment method.",
      });
    }
  }

  routes(): Router {
    const router = Router();

    router.get("/mpesa-kenya", this.getMPesaAccounts.bind(this));
    router.post("/mpesa-kenya", this.addMPesa.bind(this));

    router.get("/cbe", this.getCBEAccounts.bind(this));
    router.post("/cbe", this.addCBE.bind(this));

    router.get("/:fiatCurrency", this.getPaymentMethodsByCurrency.bind(this));

    return router;
  }
}
