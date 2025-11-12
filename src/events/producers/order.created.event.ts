import { Prisma } from '@prisma/client';
import {
  BaseProducer,
  type KafkaMessage,
  type WithMetadata,
} from '@payvo/kafka';

import { orderTopics } from '@payvo/kafka';
import { producer } from '@/config/kafka';

/**
 * Represents the data structure for an order created event to be published to Kafka.
 * Includes core order details and inherits standardized event metadata.
 */
export interface TOrderCreatedData extends WithMetadata {
  orderId: string;
  orderNumber: string;
  adId: string;
  customerId: string;
  agentId: string;
  paymentMethodId: string;
  paymentDetails?: Prisma.JsonValue;

  orderAmount: string;
  quantity: string;
  unitPrice: string;

  status: string;
  statusHistory: any[];

  createdAt: string;
  expiresAt: string;
}

/**
 * A singleton producer class for publishing order created events to Kafka.
 */
export class OrderCreatedProducer extends BaseProducer<TOrderCreatedData> {
  protected readonly topic = orderTopics.ORDER_CREATED.name;
  private static instance: OrderCreatedProducer;
  private constructor() {
    super(producer);
  }
  /**
   * Returns the singleton instance of the producer.
   */
  public static getInstance(): OrderCreatedProducer {
    if (!OrderCreatedProducer.instance) {
      OrderCreatedProducer.instance = new OrderCreatedProducer();
    }
    return OrderCreatedProducer.instance;
  }

  /**
   * Publishes a new order created event to the Kafka topic.
   */
  public async publishOrderCreated(
    message: KafkaMessage<TOrderCreatedData>
  ): Promise<void> {
    const enriched = this.enrichMessage(message);
    await this.publish(enriched);
  }
}

/**
 * Utility function to publish an order created event.
 */
export const publishOrderCreated = async (
  data: KafkaMessage<TOrderCreatedData>
): Promise<void> => {
  return OrderCreatedProducer.getInstance().publishOrderCreated(data);
};
