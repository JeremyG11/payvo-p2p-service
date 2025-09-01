import { z } from "zod";
import { OrderStatus } from "@prisma/client";

export const CreateOrderSchema = z.object({
  userPaymentMethodId: z.string().uuid("Invalid payment method ID"),
  adId: z.string().uuid("Invalid ad ID"),
  amount: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: "Amount must be a positive number",
    }),
  recipientDetails: z.object({
    accountNumber: z.string().min(5, "Account number is too short"),
    bankName: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
});

export const OrderQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(10),
  status: z.nativeEnum(OrderStatus).optional(),
  currencyPair: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type TCreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type TOrderQueryInput = z.infer<typeof OrderQuerySchema>;
