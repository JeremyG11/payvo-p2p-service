import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // basic
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5006,
  serviceName: process.env.SERVICE_NAME,
  internalServiceToken: process.env.INTERNAL_ACCESS_SECRET,

  // p2p configs
  rates: {
    inboundMargin: process.env.INBOUND_MARGIN,
    outboundMargin: process.env.OUTBOUND_MARGIN,
    minVolumeThreshold: process.env.MIN_VOLUME_THRESHOLD,
    maxRateDeviation: process.env.MAX_RATE_DEVIATION,
    dbQueryRecencyMinutes: process.env.DB_QUERY_RECENCY_MINUTES,
    topAdsConsidered: process.env.BINANCE_TOP_ADS,
  },

  // crypto
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,
  authSecret: process.env.PAYVO_AUTH_SECRET,
  authIssuer: process.env.AUTH_ISSUER || 'payvo-auth-service',

  // kafka
  kafka: {
    enabled:
      process.env.KAFKA_ENABLED === 'true' ||
      (process.env.NODE_ENV === 'production' &&
        process.env.KAFKA_ENABLED !== 'false'),
    namespace: process.env.KAFKA_NAMESPACE || 'prod',
    brokers: process.env.KAFKA_BROKERS
      ? process.env.KAFKA_BROKERS.split(',')
      : ['localhost:9092'],

    clientId: process.env.KAFKA_CLIENT_ID || 'payvo-p2p-service',
    groupId: process.env.KAFKA_GROUP_ID || 'p2p-service-group',
    topicPartitions: Number(process.env.KAFKA_TOPIC_PARTITIONS) || 3,
  },

  // redis
  redisUrl: process.env.REDIS_URL,
  CACHE_TTL: process.env.CACHE_TTL || 3600,

  // jwt
  jwtSecret: process.env.JWT_SECRET!,

  // mail
  domain: process.env.FRONTEND_DOMAIN_URL!,

  commissionPercent: process.env.COMMISSION_PERCENT!,
  servicesURLs: {
    auth: process.env.AUTH_SERVICE_URL!,
    p2p: process.env.P2P_SERVICE_URL!,
  },
} as const;
