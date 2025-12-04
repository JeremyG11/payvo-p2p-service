import { z } from '@gatwech/utils/zod';
import { createTopicConfig } from '@gatwech/kafka';

import { config } from '@/config/env';

export const p2pTopics = createTopicConfig({
  ORDER_CREATED: {
    name: 'order.created',
    schema: z.object({
      orderId: z.string(),
      orderNumber: z.string(),
      adId: z.string(),
      customerId: z.string(),
      agentId: z.string(),
      paymentMethodId: z.string(),
      paymentDetails: z.any().optional(),
      orderAmount: z.string(),
      quantity: z.string(),
      unitPrice: z.string(),
      status: z.string(),
      statusHistory: z.array(z.any()),
      createdAt: z.string(),
      expiresAt: z.string(),
      timestamp: z.number(),
    }),
    partitions: 3,
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupPolicy: 'delete',
  },
});

export const topic = (name: string) => `${config.kafka.namespace}.${name}`;
