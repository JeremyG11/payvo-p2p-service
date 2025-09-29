import { topics, BaseProducer, KafkaMessage, WithMetadata } from '@payvo/kafka';
import { producer } from '@/config/kafka';

/**
 * The Kafka topic for order created events.
 */
export const ORDER_CREATED_TOPIC = topics.TOPICS.ORDER_CREATED.name;

/**
 * Represents the data structure for an order created event to be published to Kafka.
 * Includes core order details and inherits standardized event metadata.
 */
export interface TOrderCreatedData extends WithMetadata {
  orderId: string;
  adId: string;
  customerId: string;
  agentId: string;
  fiatAmount: string;
  cryptoAmount: string;
  unitPrice: string;
  paymentMethodId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * A singleton producer class for publishing order created events to Kafka.
 */
export class OrderCreatedProducer extends BaseProducer<TOrderCreatedData> {
  protected readonly topic = ORDER_CREATED_TOPIC;
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
    const enriched = this.enrichMessage(message); // adds metadata like correlationId, timestamp
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
