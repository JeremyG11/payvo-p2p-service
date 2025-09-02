import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const CreateOrderSchema = z.object({
  adId: z.uuid('Invalid ad ID').nonempty({
    message: 'Ad ID is required',
  }),
  unitPrice: z
    .number()
    .min(0, { message: 'Unit price must be a positive number' }),
  quantity: z.number().min(1, { message: 'Quantity must be at least 1' }),
  amount: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a positive number',
    }),
});

export const OrderQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(10),
  status: z.enum(OrderStatus).optional(),
  currencyPair: z.string().optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
});

export type TCreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type TOrderQueryInput = z.infer<typeof OrderQuerySchema>;
