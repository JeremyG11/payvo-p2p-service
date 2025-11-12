import { logger } from '@/lib/logger';
import { config } from '@/config/env';
import { HashCacheService } from '@payvo/redis';
import { UserCacheFields, userCacheHashKey } from '@/lib/cache-keys';

interface UserCacheServiceOptions {
  defaultTtl?: number;
  logger?: any;
}

/**
 * A robust Redis-backed caching service for user-scoped data.
 * Uses Redis Hashes under the hood, with configurable TTL per key.
 */
export class UserCacheService {
  private hashCache: HashCacheService;
  private defaultTtl: number;

  constructor(options?: UserCacheServiceOptions) {
    const redisUrl = config.redisUrl;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }

    this.defaultTtl = options?.defaultTtl ?? 300;
    this.hashCache = new HashCacheService(redisUrl, {
      ttl: this.defaultTtl,
      logger: options?.logger || logger,
    });
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
      return await this.hashCache.getField<T>(key, field);
    } catch (error) {
      logger.error('Failed to get user data', { error, userId, field });
      return null;
    }
  }
}

let _instance: UserCacheService | null = null;

export function getUserCacheService(): UserCacheService {
  if (_instance) return _instance;

  const defaultTtl = Number(config.CACHE_TTL) || 300;

  _instance = new UserCacheService({ defaultTtl });
  logger.info('UserCacheService initialized successfully');

  return _instance;
}

export const userCacheService = getUserCacheService();
