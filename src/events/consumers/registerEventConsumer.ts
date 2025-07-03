import { config } from "@/config/env";
import { ConsumerConfig } from "kafkajs";
import { generateOTP } from "@/lib/utils/otp";
import { loggerInstance } from "@payvo/logger";
import { kafkaClient, userTopics } from "@/kafka";
import { corrNanoid } from "@/lib/utils/correlationId";
import { sendVerificationEmailOTP } from "@/lib/mails";

const logger = loggerInstance("notification-service");

interface RegistrationAttemptMessage {
  email: string;
  name: string;
  otp: string;
  metadata?: {
    source: string;
    correlationId: string;
    [key: string]: unknown;
  };
}

export const setupRegistrationConsumer = async () => {
  const consumer = await kafkaClient.createConsumer(
    config.kafka.groupId,
    {} as ConsumerConfig
  );

  await consumer.connect();
  await consumer.subscribe({
    topic: userTopics.USER_TOPICS.USER_REGISTRATION_ATTEMPTS,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const correlationId =
        message.headers?.correlationId?.toString() ||
        corrNanoid("notif-missing");

      try {
        const value: RegistrationAttemptMessage = JSON.parse(
          message.value?.toString() || "{}"
        );

        logger.info("Processing registration attempt", {
          email: value.email,
          correlationId,
          source: value.metadata?.source,
        });

        const otp = generateOTP(6);

        await sendVerificationEmailOTP(value.email, value.name, value.otp);

        logger.info("Verification email sent", {
          email: value.email,
          correlationId,
          otpPrefix: "***" + otp.slice(-3),
        });
      } catch (error) {
        logger.error("Failed to process registration attempt", {
          error,
          correlationId,
          rawMessage: message.value?.toString(),
        });

        // Implement your retry or dead letter queue logic here
      }
    },
  });

  return consumer;
};
