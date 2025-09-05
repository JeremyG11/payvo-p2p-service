import { Redis } from 'ioredis';
import { ServiceCacheService } from '@payvo/redis';
import { logger } from '@/lib/logger';
import { config } from '@/config/env';

const P2P_NAMESPACE = 'p2p';

/**
 * A dedicated Redis cache service for the P2P microservice.
 * This class extends the generic ServiceCacheService with a predefined namespace.
 */
export class P2PCacheService extends ServiceCacheService {
  /**
   * Constructs the P2PCacheService, automatically setting the namespace.
   * @param redisClient The Redis client instance.
   */
  constructor(redisClient: Redis) {
    super(redisClient, P2P_NAMESPACE);
  }
}

// singleton instance and export it for use throughout the service.
let p2pCacheServiceInstance: P2PCacheService | null = null;
const redisUrl = config.redisUrl;

if (!redisUrl) {
  logger.error(
    'REDIS_URL environment variable is required for P2P cache service.'
  );
} else {
  try {
    const redisClient = new Redis(redisUrl);
    p2pCacheServiceInstance = new P2PCacheService(redisClient);
    logger.info('P2PCacheService initialized successfully.');
  } catch (error) {
    logger.error('Failed to initialize P2PCacheService', { error });
  }
}

export * from './user-cache';
export * from './blacklist-cache';

export const p2pCacheService = p2pCacheServiceInstance;
