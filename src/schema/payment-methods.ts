import { z } from '@gatwech/utils/zod';

export const AddMPesaKenyaSchema = z.object({
  phoneNumber: z.string(),
});

export const AddCbePaymentMethodSchema = z.object({
  isDefault: z.boolean().optional(),
  accountName: z.string().min(2).max(100),
  accountNumber: z.string().length(13, {
    message: 'Account number must be exactly 13 digits.',
  }),
});

export const AddTeleBirrSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
});

export const AddPaymentMethodQueryParamsSchema = z.object({
  methodName: z.enum(['mpesa-kenya', 'cbe', 'telebirr']),
});

export type AddMPesaKenyaPayload = z.infer<typeof AddMPesaKenyaSchema>;
export type AddCbePaymentMethodPayload = z.infer<
  typeof AddCbePaymentMethodSchema
>;

export type AddTeleBirrPayload = z.infer<typeof AddTeleBirrSchema>;
