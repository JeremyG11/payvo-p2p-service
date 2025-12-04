import { FiatCurrency } from '@/generated/prisma/client';
import { z } from '@gatwech/utils/zod';

export const QueryParamsSchema = z.object({
  paymentMethodId: z
    .uuid()
    .nonempty({ message: 'Invalid payment method id format' }),
});

export const CurrencyParamSchema = z.object({
  fiatCurrency: z.enum(FiatCurrency, {
    message: 'Invalid or Unsupported currency',
  }),
});
