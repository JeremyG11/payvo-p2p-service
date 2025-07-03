import { config } from "@/config/env";
import { loggerInstance } from "@payvo/logger";

const logger = loggerInstance(config.serviceName);

export const startConsumers = async (): Promise<void> => {
  try {
    logger.info(`Starting Kafka consumers for ${config.serviceName}`);

    logger.info(
      `All Kafka consumers started successfully for ${config.serviceName}`
    );
  } catch (error) {
    logger.error("Failed to start Kafka consumers", error);
    throw error;
  }
};
