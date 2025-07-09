import { config } from '@/config/env';
import RedisClient from '@payvo/redis';

let clientInstance: RedisClient | null = null;

export const initRedis = async (): Promise<
  ReturnType<RedisClient['getInstance']>
> => {
  try {
    clientInstance = await RedisClient.create({
      url: config.redisUrl,
      reconnect: {
        maxAttempts: 5,
        delay: 1000,
        timeout: 5000,
      },
      healthCheck: {
        interval: 10000,
        enabled: true,
      },
    });

    return clientInstance.getInstance();
  } catch (error) {
    console.error('Error initializing Redis:', error);
    throw new Error('Redis initialization failed.');
  }
};

export const redis = (): ReturnType<RedisClient['getInstance']> => {
  if (!clientInstance) {
    throw new Error('Redis client is not initialized. Call initRedis first.');
  }
  return clientInstance.getInstance();
};
