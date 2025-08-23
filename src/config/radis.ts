import { config } from "@/config/env";
import RedisClient from "@payvo/redis";

let client: RedisClient | null = null;

/**
 * Initialize and return the singleton Redis client.
 */
export async function initRedis(): Promise<
  ReturnType<RedisClient["getInstance"]>
> {
  if (client) {
    return client.getInstance();
  }

  client = await RedisClient.create({
    url: config.redisUrl,
    reconnect: { maxAttempts: 5, delay: 1_000, timeout: 5_000 },
    healthCheck: { enabled: true, interval: 10_000 },
  });

  return client.getInstance();
}

/**
 * Return the already initialized Redis client.
 * Throws if you forgot to call `initRedis()` at startup.
 */
export function getRedis(): ReturnType<RedisClient["getInstance"]> {
  if (!client) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return client.getInstance();
}

/** Optionally, to shut it down cleanly: */
export async function shutdownRedis() {
  if (!client) return;
  await client.getInstance().quit();
  client = null;
}
