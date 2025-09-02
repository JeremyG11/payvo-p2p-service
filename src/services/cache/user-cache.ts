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

let userCacheServiceInstance: UserCacheService | null = null;

try {
  userCacheServiceInstance = new UserCacheService({
    defaultTtl: Number(config.CACHE_TTL),
  });
  logger.info('UserCacheService initialized successfully');
} catch (error) {
  logger.error('Failed to initialize UserCacheService', { error });
  // We might want to create a fallback implementation that doesn't use Redis
  // but for now, we'll just leave it as null
}

export const userCacheService = userCacheServiceInstance;
