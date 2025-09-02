import { config } from '@/config/env';
import { logger } from '@/lib/logger';
import {
  RolePermissionCacheService,
  CachePublisherService,
  CacheSubscriberService,
  DistributedLockService,
  HashCacheService,
} from '@payvo/redis';

let redisClient: any = null;

// Cache services
let cacheService: RolePermissionCacheService | null = null;
let publisher: CachePublisherService | null = null;
let subscriber: CacheSubscriberService | null = null;
let lockService: DistributedLockService | null = null;
let hashCacheService: HashCacheService | null = null;

/**
 * Initialize Redis connection and cache services
 */
export async function initRedis(): Promise<void> {
  try {
    const redisUrl = config.redisUrl;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }

    logger.info('Initializing Redis connection and cache services...');

    cacheService = new RolePermissionCacheService(redisUrl, {
      cacheKey: 'app_roles_permissions',
      ttl: Number(config.CACHE_TTL) || 3600,
      logger,
    });

    publisher = new CachePublisherService(redisUrl, { logger });
    subscriber = new CacheSubscriberService(redisUrl, { logger });
    lockService = new DistributedLockService(redisUrl, { logger });
    hashCacheService = new HashCacheService(redisUrl, {
      ttl: Number(config.CACHE_TTL),
      logger,
    });

    logger.info('Redis cache services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis services', { error });
    throw error;
  }
}

/**
 * Get the cache service instance
 */
export function getCacheService(): RolePermissionCacheService {
  if (!cacheService) {
    throw new Error('CacheService not initialized. Call initRedis() first.');
  }
  return cacheService;
}

/**
 * Get the publisher service instance
 */
export function getPublisher(): CachePublisherService {
  if (!publisher) {
    throw new Error('Publisher not initialized. Call initRedis() first.');
  }
  return publisher;
}

/**
 * Get the subscriber service instance
 */
export function getSubscriber(): CacheSubscriberService {
  if (!subscriber) {
    throw new Error('Subscriber not initialized. Call initRedis() first.');
  }
  return subscriber;
}

/**
 * Get the lock service instance
 */
export function getLockService(): DistributedLockService {
  if (!lockService) {
    throw new Error('LockService not initialized. Call initRedis() first.');
  }
  return lockService;
}

/**
 * Get the hash cache service instance
 */
export function getHashCacheService(): HashCacheService {
  if (!hashCacheService) {
    throw new Error(
      'HashCacheService not initialized. Call initRedis() first.'
    );
  }
  return hashCacheService;
}

/**
 * Shutdown Redis connection and clean up resources
 */
export async function shutdownRedis(): Promise<void> {
  try {
    logger.info('Shutting down Redis services...');

    // Disconnect all services
    const disconnectPromises: Promise<void>[] = [];

    if (
      cacheService &&
      typeof (cacheService as any).disconnect === 'function'
    ) {
      disconnectPromises.push((cacheService as any).disconnect());
    }

    if (publisher && typeof (publisher as any).disconnect === 'function') {
      disconnectPromises.push((publisher as any).disconnect());
    }

    if (subscriber && typeof (subscriber as any).disconnect === 'function') {
      disconnectPromises.push((subscriber as any).disconnect());
    }

    if (lockService && typeof (lockService as any).disconnect === 'function') {
      disconnectPromises.push((lockService as any).disconnect());
    }

    if (
      hashCacheService &&
      typeof (hashCacheService as any).disconnect === 'function'
    ) {
      disconnectPromises.push((hashCacheService as any).disconnect());
    }

    await Promise.all(disconnectPromises);
    logger.info('Redis services shut down successfully');
  } catch (error) {
    logger.error('Error shutting down Redis services', { error });
  }
}

export { cacheService, publisher, subscriber, lockService, hashCacheService };
