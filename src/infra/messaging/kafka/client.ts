import { logger } from '@/lib/logger';
import { p2pTopics } from './topics';
import { config } from '@/config/env';
import { createKafkaClient, type KafkaClientConfig } from '@gatwech/kafka';

export const client = createKafkaClient({
  config: {
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    allowAutoTopicCreation: false,
    metricsEnabled: true,
    topics: p2pTopics,
    topicProvisioning: {
      partitions: config.kafka.topicPartitions || 3,
      replicationFactor: Number(process.env.KAFKA_TOPIC_RF ?? 1),
    },
    resilience: {
      enabled: true,
      /**
       * Circuit Breaker with Half-Open State
       * Opens after 5 consecutive failures, Waits 30 seconds before allowing a test request (Half-Open)
       * If test succeeds, circuit closes; if fails, reopens
       */
      circuitBreaker: {
        enabled: true,
        failureThreshold: 1,
        resetTimeoutMs: 5000, // 5  seconds Half-Open timeout
      },
      /**
       * Background Reconnection Monitor. Checks connection every 60 seconds,
       * prevents overlapping reconnection attempts (concurrency-safe),
       * re-provisions topics after successful reconnection
       */
      reconnection: {

        enabled: true,
        /**
         * Interval in milliseconds between reconnection attempts
         */
        intervalMs: 60000,

        /**
         * Callback after each reconnection attempt
         */
        onReconnect: async () => {
          logger.info('Reconnected to Kafka! Re-provisioning topics...');
          try {
            await client.provisionTopics();
            logger.info('Topics re-provisioned successfully');
          } catch (error) {
            logger.error(
              'Failed to re-provision topics after reconnection',
              error
            );
          }
        },
      },
    },
    autoConnectAsync: true,
    
  },
} satisfies KafkaClientConfig);

export async function initializeKafkaClient() {
  try {
    logger.info('Initializing Kafka connection...');

    await client.connect();
    logger.info('Connected to Kafka successfully');

    logger.info('Provisioning topics...');
    await client.provisionTopics();
    logger.info('Topics provisioned successfully');

    return true;
  } catch (error) {
    logger.error('Kafka initialization failed', error);
    logger.info('Background reconnection will retry automatically...');
    return false;
  }
}

export async function disconnectKafkaClient() {
  try {
    await client.disconnect();
    logger.info('Kafka disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka', error);
    /** Don't throw - allow graceful shutdown to continue */
  }
}

export const producer = client.getProducer();
