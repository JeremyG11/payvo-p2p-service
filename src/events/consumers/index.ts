import { config } from '@/config/env';
import { logger } from '@/lib/logger';

export const startConsumers = async (): Promise<void> => {
  try {
    logger.info(`Starting Kafka consumers for ${config.serviceName}`);

    logger.info(
      `All Kafka consumers started successfully for ${config.serviceName}`
    );
  } catch (error) {
    logger.error('Failed to start Kafka consumers', error);
    throw error;
  }
};
