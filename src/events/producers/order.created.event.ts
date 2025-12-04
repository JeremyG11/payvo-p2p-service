import { Prisma } from '@/generated/prisma/client';
import {
  BaseProducer,
  type TKafkaMessage,
  type WithMetadata,
} from '@gatwech/kafka';

import { p2pTopics } from '@/infra/messaging/kafka/topics';
import { producer } from '@/infra/messaging/kafka/client';

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
  protected readonly topic = p2pTopics.ORDER_CREATED.name;
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
    message: TKafkaMessage<TOrderCreatedData>
  ): Promise<void> {
    await this.publish(message);
  }
}

/**
 * Utility function to publish an order created event.
 */
export const publishOrderCreated = async (
  data: TKafkaMessage<TOrderCreatedData>
): Promise<void> => {
  return OrderCreatedProducer.getInstance().publishOrderCreated(data);
};
