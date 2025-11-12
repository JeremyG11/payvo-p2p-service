import { FiatCurrency, PaymentMethodCategory } from '@prisma/client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PAYMENT_METHODS_CONFIG } from '@/config';

/**
 * Seeds the database with supported payment methods for all configured fiat currencies.
 * This function uses upsert for idempotency.
 */
export async function seedAllSupportedPaymentMethods(): Promise<void> {
  logger.info('Starting payment method seeding process...');

  try {
    for (const method of PAYMENT_METHODS_CONFIG) {
      await seedSupportedPaymentMethods(
        method.fiatCurrency,
        method.paymentMethods
      );
    }

    logger.info('Payment method seeding process completed successfully.');
  } catch (error) {
    logger.error('Failed to seed payment methods:', error);
    throw error; 
  }
}

/**
 * Seeds the database with supported payment methods for a given fiat currency.
 * This function uses upsert for idempotency.
 * @param fiatCurrency The fiat currency.
 * @param paymentMethods An array of payment method configurations.
 */
export async function seedSupportedPaymentMethods(
  fiatCurrency: FiatCurrency,
  paymentMethods: {
    provider: string;
    displayName: string;
    category: PaymentMethodCategory;
  }[]
): Promise<void> {
  logger.info(`Seeding supported payment methods for ${fiatCurrency}:`, {
    paymentMethods,
  });

  try {
    for (const method of paymentMethods) {
      await prisma.supportedPaymentMethod.upsert({
        where: {
          provider_currency: {
            provider: method.provider,
            currency: fiatCurrency,
          },
        },
        update: {
          displayName: method.displayName,
          category: method.category,
          isActive: true,
        },
        create: {
          provider: method.provider,
          category: method.category,
          currency: fiatCurrency,
          isActive: true,
          displayName: method.displayName,
        },
      });
    }
    logger.info(
      `Successfully upserted ${paymentMethods.length} payment methods for ${fiatCurrency}.`
    );
  } catch (error) {
    logger.error(
      `Failed to seed supported payment methods for ${fiatCurrency}:`,
      error
    );
    throw error;
  }
}
