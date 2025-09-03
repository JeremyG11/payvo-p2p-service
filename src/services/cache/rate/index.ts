import Redis from 'ioredis';
import { logger } from '@/lib/logger';

export interface RedisCacheServiceOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  ttl?: number;
}

export class RedisCacheService {
  private redis: Redis;
  private defaultTtl: number;

  constructor(options: RedisCacheServiceOptions = {}) {
    const {
      host = process.env.REDIS_HOST || 'localhost',
      port = parseInt(process.env.REDIS_PORT || '6379'),
      password = process.env.REDIS_PASSWORD,
      db = parseInt(process.env.REDIS_DB || '0'),
      ttl = 300, // Default 5 minutes
    } = options;

    this.redis = new Redis({
      host,
      port,
      password,
      db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.defaultTtl = ttl;

    this.redis.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis client error', error);
    });
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      logger.error(`Failed to get key ${key} from Redis`, error);
      return null;
    }
  }

  /**
   * Set a value in Redis with optional TTL
   */
  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to set key ${key} in Redis`, error);
      return false;
    }
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error(`Failed to delete key ${key} from Redis`, error);
      return false;
    }
  }

  /**
   * Get keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      logger.error(
        `Failed to get keys with pattern ${pattern} from Redis`,
        error
      );
      return [];
    }
  }

  /**
   * Close the Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis client', error);
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.redis.status === 'ready';
  }
}

// Create and export a singleton instance
let redisCacheServiceInstance: RedisCacheService | null = null;

export function getRedisCacheService(
  options?: RedisCacheServiceOptions
): RedisCacheService {
  if (!redisCacheServiceInstance) {
    redisCacheServiceInstance = new RedisCacheService(options);
  }
  return redisCacheServiceInstance;
}

export const redisCacheService = getRedisCacheService();
