import { AdType, FiatCurrency } from '@prisma/client';
import { z } from 'zod';

export const AdTypeSchema = z
  .enum(AdType)
  .refine((val) => val === AdType.BUY || val === AdType.SELL, {
    message: 'Invalid ad type. Must be BUY or SELL.',
  });

export const QueryAdTypeSchema = z.object({
  adType: AdTypeSchema,
});
export const CreateAdSchema = z

  .object({
    crypto: z.string().optional(),
    adType: AdTypeSchema,

    unitPrice: z
      .number({
        error: 'Unit price must be a number',
      })
      .positive('Unit price must be a positive number'),

    minLimitFiat: z.coerce
      .number({
        error: 'Min limit must be a number',
      })
      .positive('Min limit must be a positive number'),

    maxLimitFiat: z.coerce
      .number({
        error: 'Max limit must be a number',
      })
      .positive('Max limit must be a positive number'),
    fromCurrency: z.enum(FiatCurrency).refine((val) => val in FiatCurrency, {
      message: 'Invalid fiat currency.',
    }),
    toCurrency: z.enum(FiatCurrency).refine((val) => val in FiatCurrency, {
      message: 'Invalid fiat currency.',
    }),
    terms: z.string().optional(),

    title: z.string().optional(),

    paymentMethods: z
      .string()
      .array()
      .min(1, { message: 'An ad must have at least one payment method.' }),
  })
  .strict();

export const UpdateAdSchema = z
  .object({
    fiatCryptoRateId: z.string().cuid().optional(),
    availableAmount: z.coerce.number().positive().optional(),
    minLimitFiat: z.coerce.number().positive().optional(),
    maxLimitFiat: z.coerce.number().positive().optional(),
    terms: z.string().min(10).optional(),
    title: z.string().min(3).max(100).optional(),
    paymentMethods: z.string().array().min(1).optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED']).optional(),
    isOnline: z.boolean().optional(),
  })
  .strict();

export const BrowseAdsSchema = z
  .object({
    minLimitFiat: z.coerce.number().optional(),
    maxLimitFiat: z.coerce.number().optional(),
    currencyPair: z.string().optional(),
    fiatCurrency: z.string().optional(),
    cryptoCurrency: z.string().optional(),
    paymentMethod: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type TCreateAd = z.infer<typeof CreateAdSchema>;
export type TUpdateAd = z.infer<typeof UpdateAdSchema>;
export type TBrowseAds = z.infer<typeof BrowseAdsSchema>;
