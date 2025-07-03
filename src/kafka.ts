import { Admin } from "kafkajs";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";
import { KafkaClient, topics } from "@payvo/kafka";
import { startConsumers } from "@/events/consumers";

export const userTopics = topics;

export const kafkaClient = new KafkaClient(
  config.serviceName,
  config.kafka.brokers
);

export const producer = kafkaClient.getProducer();

export async function ensureTopicsExist(admin: Admin, topics: string[]) {
  try {
    const existingTopics = await admin.listTopics();
    const topicsToCreate = topics.filter((t) => !existingTopics.includes(t));

    if (topicsToCreate.length > 0) {
      logger.info(`Creating missing topics: ${topicsToCreate.join(", ")}`);
      await admin.createTopics({
        topics: topicsToCreate.map((topic) => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
          configEntries: [{ name: "retention.ms", value: "604800000" }],
        })),
      });
    }
  } catch (error) {
    logger.error("Failed to ensure topics exist", { error });
    throw error;
  }
}

export const connectKafka = async () => {
  try {
    await kafkaClient.connect();
    logger.info("Kafka producer connected");
  } catch (error) {
    logger.error("Failed to connect Kafka producer/consumer", error);
    throw error;
  }
};

export const disconnectKafka = async () => {
  try {
    await kafkaClient.disconnect();
    logger.info("Kafka producer disconnected");
  } catch (error) {
    logger.error("Failed to disconnect Kafka producer", error);
  }
};

// export const startConsumers = async () => {
//   try {
//     const admin = kafkaClient.getAdmin();
//     await ensureTopicsExist(admin, [
//       topics.USER_TOPICS.USER_REGISTRATION_ATTEMPTS,
//     ]);

//     await admin.disconnect();
//   } catch (error) {
//     logger.error("Failed to start Kafka consumers", error);
//     throw error;
//   }
// };

export default async function kafkaInit() {
  try {
    await startConsumers();

    logger.info(`${config.serviceName} initialized successfully`);
  } catch (error) {
    logger.error(`Failed to initialize ${config.serviceName}`, error);
    throw error;
  }
}
