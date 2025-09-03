import z from 'zod';

export const QueryParamsSchema = z.object({
  paymentMethodId: z
    .uuid()
    .nonempty({ message: 'Invalid payment method id format' }),
});
