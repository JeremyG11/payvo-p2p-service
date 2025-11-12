import { config } from '@/config/env';
import { logger } from '@/lib/logger';
import { KafkaClient, topics, type Producer } from '@payvo/kafka';
import { startConsumers } from '@/events/consumers';
import { ensureTopicsWithConfig } from '@payvo/kafka';

export const userTopics = topics;

export const kafkaClient = new KafkaClient(
  config.serviceName || 'payvo-p2p-service',
  config.kafka.brokers,
  {
    allowAutoTopicCreation: false,
  }
);

export const connectKafka = async () => {
  try {
    await kafkaClient.connect();
    logger.info('Kafka producer connected');
  } catch (error) {
    logger.error('Failed to connect Kafka producer/consumer', error);
    throw error;
  }
};

export const disconnectKafka = async () => {
  try {
    await kafkaClient.disconnect();
    logger.info('Kafka producer disconnected');
  } catch (error) {
    logger.error('Failed to disconnect Kafka producer', error);
  }
};

export default async function kafkaInit() {
  try {
    await connectKafka();

    // ensure topics exist with the right configs/partitions before starting consumers
    if (process.env.PROVISION_KAFKA_TOPICS === '1') {
      logger.info('PROVISION_KAFKA_TOPICS=1, ensuring topics/configs...');
      await ensureTopicsWithConfig(
        kafkaClient.getAdmin(),
        {
          partitions: config.kafka.topicPartitions || 3,
          replicationFactor: Number(process.env.KAFKA_TOPIC_RF ?? 1),
          waitForLeadersMs: 15_000,
        },
        true
      );
    } else {
      logger.info(
        'Skipping Kafka topic provisioning (PROVISION_KAFKA_TOPICS!=1)'
      );
    }

    await startConsumers();

    logger.info(`${config.serviceName} initialized successfully`);
  } catch (error) {
    logger.error(`Failed to initialize ${config.serviceName}`, error);
    throw error;
  }
}

export const producer: Producer = kafkaClient.getProducer();
