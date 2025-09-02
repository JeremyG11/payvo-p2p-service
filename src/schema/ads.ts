import { z } from "zod";

export const CreateAdSchema = z

  .object({
    fiatCryptoRateId: z.string().min(1, "Invalid rate ID"),
    availableAmount: z.coerce
      .number({
        error: "Available amount must be a number",
      })
      .positive("Available amount must be a positive number"),

    minLimitFiat: z.coerce
      .number({
        error: "Min limit must be a number",
      })
      .positive("Min limit must be a positive number"),

    maxLimitFiat: z.coerce
      .number({
        error: "Max limit must be a number",
      })
      .positive("Max limit must be a positive number"),

    terms: z.string().optional(),

    title: z.string().optional(),

    paymentMethods: z
      .string()
      .array()
      .min(1, { message: "An ad must have at least one payment method." }),
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
    status: z.enum(["ACTIVE", "PAUSED", "EXPIRED", "DELETED"]).optional(),
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
