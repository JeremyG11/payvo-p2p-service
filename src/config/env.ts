import dotenv from "dotenv";
dotenv.config();

export const config = {
  // basic
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,
  serviceName: process.env.SERVICE_NAME,

  // crypto
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,

  // kafka
  kafka: {
    brokers: process.env.KAFKA_BROKERS
      ? process.env.KAFKA_BROKERS.split(",")
      : ["localhost:9092"],

    clientId: process.env.KAFKA_CLIENT_ID || "payvo-p2p-service",
    groupId: process.env.KAFKA_GROUP_ID || "p2p-service-group",
  },

  // redis
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  // jwt
  jwtSecret: process.env.JWT_SECRET!,

  // mail
  domain: process.env.FRONTEND_DOMAIN_URL!,
};
