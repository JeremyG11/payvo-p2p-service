export * from "./user-cache";
export * from "./blacklist-cache";

import {
  RedisModules,
  RedisScripts,
  RedisFunctions,
  RedisClientType,
} from "redis";
import {
  AppCacheFields,
  appCacheHashKey,
 } from "@/lib/cache-keys";
import { logger } from "@/lib/logger";
import { getRedis } from "@/config/radis";

export interface CacheServiceOptions {
  /** Default time-to-live in seconds */
  defaultTtl?: number;
}

/**
 * A robust Redis-backed caching service for app- and user-scoped data.
 * Uses Redis Hashes under the hood, with configurable TTL per key.
 */
export class RedisCacheService {
  private defaultTtl: number;

  /** Get the Redis client instance */
  private get client(): RedisClientType<
    RedisModules,
    RedisFunctions,
    RedisScripts
  > {
    return getRedis();
  }
  constructor(options?: CacheServiceOptions) {
    this.defaultTtl = options?.defaultTtl ?? 300;
  }

  /**
   * Cache a value in the global app hash.
   */
  async setAppData<T>(
    field: AppCacheFields,
    value: T,
    ttl = this.defaultTtl
  ): Promise<void> {
    const key = appCacheHashKey();
    try {
      await this.hSetWithExpire(key, field, JSON.stringify(value), ttl);
      logger.info("App data cached", { key, field, ttl });
    } catch (error) {
      logger.error("Failed to cache app data", { error, key, field });
      throw error;
    }
  }

  /**
   * Retrieve a value from the global app hash.
   */
  async getAppData<T>(field: AppCacheFields): Promise<T | null> {
    const key = appCacheHashKey();
    try {
      const raw = await this.client.hGet(key, field);
      return raw ? (JSON.parse(raw.toString()) as T) : null;
    } catch (error) {
      logger.error("Failed to get app data", { error, key, field });
      return null;
    }
  }

  /**
   * Remove one field from the global app hash.
   */
  async deleteAppData(field: AppCacheFields): Promise<void> {
    const key = appCacheHashKey();
    try {
      await this.client.hDel(key, field);
      logger.info("App data deleted", { key, field });
    } catch (error) {
      logger.error("Failed to delete app data", { error, key, field });
    }
  }

  /**
   * Atomically HSET and EXPIRE a Redis hash key.
   */
  private async hSetWithExpire(
    key: string,
    field: string,
    value: string,
    ttl: number
  ): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.hSet(key, field, value);
    pipeline.expire(key, ttl);
    await pipeline.exec();
  }
}

/**
 * Export a singleton instance with a default TTL override via env var.
 */
export const redisCacheService = new RedisCacheService({
  defaultTtl: Number(process.env.REDIS_CACHE_TTL) || 300,
});
