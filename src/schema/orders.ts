import { z } from '@payvo/utils/zod';
import { OrderStatus } from '@prisma/client';

export const OrderIdParamSchema = z.object({
  orderId: z.uuid({ message: 'Invalid order ID' }),
});

export const OrderQueryParamsSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(10),
  status: z.enum(OrderStatus).optional(),
  currencyPair: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const CreateOrderSchema = z.object({
  adId: z.uuid({ message: 'Invalid ad ID' }),
  paymentMethodId: z.uuid({ message: 'Invalid payment method ID' }),
  amount: z
    .string()
    .transform((val) => val.replace(/,/g, ''))
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

export const UpdateOrderStatusSchema = z.object({
  status: z.enum([
    OrderStatus.COMPLETED,
    OrderStatus.PENDING_AGENT_CONFIRMATION,
    OrderStatus.CANCELLED,
    OrderStatus.DISPUTED,
    OrderStatus.AGENT_ACCEPTED,
    OrderStatus.PROCESSING,
    OrderStatus.AGENT_REJECTED,
  ]),
  reason: z.string().max(500).optional(),
});

export type TCreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type TOrderQueryInput = z.infer<typeof OrderQuerySchema>;
export type TUpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
