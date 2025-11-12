export * from './user-cache';

import { logger } from '@/lib/logger';
import { config } from '@/config/env';
import { createRedisClient, ServiceCacheService } from '@payvo/redis';

const SERVICE_REDIS_NAMESPACE = 'p2p_service';

/**
 * A dedicated Redis cache service for the P2P microservice.
 */
export class P2PCacheService extends ServiceCacheService {
  constructor(redisClient: ReturnType<typeof createRedisClient>) {
    super(redisClient, SERVICE_REDIS_NAMESPACE);
  }
}

// Singleton instance
let p2pCacheServiceInstance: P2PCacheService | undefined;

if (!config.redisUrl) {
  logger.error(
    'REDIS_URL environment variable is required for P2P cache service.'
  );
} else {
  try {
    const redisClient = createRedisClient(config.redisUrl);
    p2pCacheServiceInstance = new P2PCacheService(redisClient);
    logger.info('P2PCacheService initialized successfully.');
  } catch (error) {
    logger.error('Failed to initialize P2PCacheService', { error });
  }
}

export const p2pCacheService = p2pCacheServiceInstance;

export * from './user-cache';
