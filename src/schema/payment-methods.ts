import z from 'zod';

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

export type AddMPesaKenyaPayload = z.infer<typeof AddMPesaKenyaSchema>;
export type AddCbePaymentMethodPayload = z.infer<
  typeof AddCbePaymentMethodSchema
>;

export type AddTeleBirrPayload = z.infer<typeof AddTeleBirrSchema>;
