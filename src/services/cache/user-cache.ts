import {
  RedisModules,
  RedisScripts,
  RedisFunctions,
  RedisClientType,
} from "redis";
import { logger } from "@/lib/logger";
import { CacheServiceOptions } from ".";
import { getRedis } from "@/config/radis";
import { UserCacheFields, userCacheHashKey } from "@/lib/cache-keys";

/**
 * A robust Redis-backed caching service for app- and user-scoped data.
 * Uses Redis Hashes under the hood, with configurable TTL per key.
 */
export class UserCacheService {
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
   * Cache a value in a user-specific hash.
   */
  async setUserData<T>(
    userId: string,
    field: UserCacheFields,
    value: T,
    ttl = this.defaultTtl
  ): Promise<void> {
    const key = userCacheHashKey(userId);
    try {
      await this.hSetWithExpire(key, field, JSON.stringify(value), ttl);
      logger.info("User data cached", { userId, key, field, ttl });
    } catch (error) {
      logger.error("Failed to cache user data", { error, userId, field });
      throw error;
    }
  }

  /**
   * Retrieve a value from a user-specific hash.
   */
  async getUserData<T>(
    userId: string,
    field: UserCacheFields
  ): Promise<T | null> {
    const key = userCacheHashKey(userId);

    try {
      const raw = await this.client.hGet(key, field);
      return raw ? (JSON.parse(raw.toString()) as T) : null;
    } catch (error) {
      logger.error("Failed to get user data", { error, userId, field });
      return null;
    }
  }

  /**
   * Delete one field from a user-specific hash.
   */
  async deleteUserData(userId: string, field: UserCacheFields): Promise<void> {
    const key = userCacheHashKey(userId);
    try {
      await this.client.hDel(key, field);
      logger.info("User data field deleted", { userId, key, field });
    } catch (error) {
      logger.error("Failed to delete user data field", {
        error,
        userId,
        field,
      });
    }
  }

  /**
   * Invalidate all cached fields for a user.
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const key = userCacheHashKey(userId);
    try {
      await this.client.del(key);
      logger.info("User cache invalidated", { userId, key });
    } catch (error) {
      logger.error("Failed to invalidate user cache", { error, userId });
    }
  }

  // Internal helpers

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

export const userCacheService = new UserCacheService();
