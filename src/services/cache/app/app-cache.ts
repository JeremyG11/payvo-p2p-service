import { logger } from '@/lib/logger';
import {
  createRedisClient,
  RolePermissionCacheService,
  CachePublisherService,
  CacheSubscriberService,
} from '@payvo/redis';

export interface CachedRolePermission {
  id: string;
  name: string;
  rolePermissions: { permission: { id: string; name: string } }[];
}

const CACHE_CHANNEL = 'roles_permissions_updates';
const CACHE_KEY = 'app_roles_permissions';

export class AppCacheService {
  private redisClient: ReturnType<typeof createRedisClient>;
  private rolePermissionCache!: RolePermissionCacheService;
  private cachePublisher!: CachePublisherService;
  private cacheSubscriber!: CacheSubscriberService;
  private isInitialized = false;
  private redisUrl: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
    this.redisClient = createRedisClient(redisUrl);

    try {
      this.rolePermissionCache = new RolePermissionCacheService(this.redisUrl, {
        cacheKey: CACHE_KEY,
        ttl: Number(process.env.REDIS_CACHE_TTL) || 3600,
        logger,
      });

      this.cachePublisher = new CachePublisherService(this.redisUrl, {
        logger,
      });
      this.cacheSubscriber = new CacheSubscriberService(this.redisUrl, {
        logger,
      });

      this.setupCacheListeners();
      this.isInitialized = true;
      logger.info('AppCacheService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AppCacheService', { error });
      this.isInitialized = false;
    }
  }

  /** Subscribe to cache invalidation events */
  private setupCacheListeners(): void {
    this.cacheSubscriber
      .subscribe(CACHE_CHANNEL, async (_, message) => {
        if (message === 'invalidate') {
          logger.info('Received cache invalidation message');
          await this.rolePermissionCache.invalidateCache();
        }
      })
      .catch((error) => {
        logger.error('Failed to subscribe to cache channel', { error });
      });
  }

  /** Fetch cached roles & permissions, fallback to database */
  public async getRolesAndPermissions(): Promise<
    CachedRolePermission[] | null
  > {
    return await this.rolePermissionCache.getRolesAndPermissions();
  }

  /** Notify other services to invalidate their cache */
  public async notifyCacheInvalidation(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Cannot notify cache invalidation - cache not initialized');
      return;
    }

    try {
      await this.cachePublisher.publishInvalidation(
        CACHE_CHANNEL,
        'invalidate'
      );
      logger.info('Cache invalidation notification sent');
    } catch (error) {
      logger.error('Failed to send cache invalidation notification', { error });
    }
  }

  /** Check if the cache service is available */
  public isCacheAvailable(): boolean {
    return this.isInitialized;
  }
}

let appCacheServiceInstance: AppCacheService | null = null;

export const getAppCacheService = (): AppCacheService => {
  if (!appCacheServiceInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl)
      throw new Error('REDIS_URL environment variable is not defined');
    appCacheServiceInstance = new AppCacheService(redisUrl);
  }
  return appCacheServiceInstance;
};

export const appCacheService = getAppCacheService();
