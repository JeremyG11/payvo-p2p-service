import { logger } from '@/lib/logger';
import {
  RolePermissionCacheService,
  CachePublisherService,
  CacheSubscriberService,
} from '@payvo/redis';
import axios from 'axios';
import { config } from '@/config/env';

interface RoleWithPermissions {
  id: string;
  name: string;
  rolePermissions: { permission: { id: string; name: string } }[];
}

export class AppCacheService {
  private rolePermissionCache: RolePermissionCacheService;
  private cachePublisher: CachePublisherService;
  private cacheSubscriber: CacheSubscriberService;
  private readonly CACHE_CHANNEL = 'roles_permissions_updates';
  private isInitialized = false;
  private readonly authServiceUrl: string;

  constructor(redisUrl: string) {
    try {
      this.authServiceUrl = config.servicesURLs.auth;

      this.rolePermissionCache = new RolePermissionCacheService(redisUrl, {
        cacheKey: 'app_roles_permissions',
        ttl: Number(process.env.REDIS_CACHE_TTL) || 3600,
        logger,
      });

      this.cachePublisher = new CachePublisherService(redisUrl, { logger });
      this.cacheSubscriber = new CacheSubscriberService(redisUrl, { logger });

      this.setupCacheListeners();
      this.isInitialized = true;

      logger.info('AppCacheService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AppCacheService', { error });
      this.isInitialized = false;
    }
  }

  /**
   * Set up cache invalidation listeners
   */
  private setupCacheListeners(): void {
    this.cacheSubscriber
      .subscribe(this.CACHE_CHANNEL, async (channel, message) => {
        if (message === 'invalidate') {
          logger.info('Received cache invalidation message');
          await this.rolePermissionCache.invalidateCache();
        } else if (message === 'refresh') {
          logger.info('Received cache refresh message');
          await this.refreshRolesAndPermissions();
        }
      })
      .catch((error) => {
        logger.error('Failed to subscribe to cache channel', { error });
      });
  }

  /**
   * Fetch cached roles & permissions, or load from the auth-service if missing.
   */
  public async getRolesAndPermissions(): Promise<RoleWithPermissions[] | null> {
    if (!this.isInitialized) {
      logger.warn('Cache not available, fetching from auth-service directly');
      return await this.fetchFromAuthService();
    }

    try {
      // Try cache first
      logger.debug('Fetching app roles & permissions from cache');
      const cached = await this.rolePermissionCache.getRolesAndPermissions();

      if (cached) {
        logger.debug('App roles & permissions loaded from cache');
        return cached;
      }

      // Cache miss, load from auth-service and repopulate cache:
      return await this.refreshRolesAndPermissions();
    } catch (err) {
      logger.error('Error getting roles and permissions from cache', err);
      // Fall back to auth-service
      return await this.fetchFromAuthService();
    }
  }

  /**
   * Fetch directly from auth-service
   */
  private async fetchFromAuthService(): Promise<RoleWithPermissions[] | null> {
    try {
      const response = await axios.get<RoleWithPermissions[]>(
        `${this.authServiceUrl}/internal/roles-permissions`,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Service ${
              process.env.SERVICE_API_KEY || 'default-api-key'
            }`,
          },
        }
      );

      return response.data;
    } catch (err) {
      logger.error('Failed to fetch roles from auth-service', { error: err });
      return null;
    }
  }

  /**
   * Force-refresh from the auth-service (and write back to the cache).
   */
  public async refreshRolesAndPermissions(): Promise<
    RoleWithPermissions[] | null
  > {
    try {
      const data = await this.fetchFromAuthService();

      if (data && this.isInitialized) {
        await this.rolePermissionCache.cacheRolesAndPermissions(data);
        logger.info('RBAC data refreshed from auth-service and cached');
      }

      return data;
    } catch (err) {
      logger.error('Failed to refresh RBAC data from auth-service', err);
      return null;
    }
  }

  /**
   * Notify other services to invalidate their cache
   */
  public async notifyCacheInvalidation(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Cannot notify cache invalidation - cache not initialized');
      return;
    }

    try {
      await this.cachePublisher.publishInvalidation(
        this.CACHE_CHANNEL,
        'invalidate'
      );
      logger.info('Cache invalidation notification sent');
    } catch (error) {
      logger.error('Failed to send cache invalidation notification', { error });
    }
  }

  /**
   * Check if the cache service is available
   */
  public isCacheAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      //   if (
      this.cacheSubscriber &&
        // typeof this.cacheSubscriber.disconnect === 'function'
        //   ) {
        //     await this.cacheSubscriber.disconnect();
        //   }

        logger.info('AppCacheService disconnected');
    } catch (error) {
      logger.error('Error disconnecting AppCacheService', { error });
    }
  }
}

// Initialize the service
let appCacheServiceInstance: AppCacheService | null = null;

try {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    appCacheServiceInstance = new AppCacheService(redisUrl);
  } else {
    logger.error(
      'Failed to initialize AppCacheService: REDIS_URL is not defined'
    );
  }
} catch (error) {
  logger.error('Error initializing AppCacheService', { error });
}

export const appCacheService = appCacheServiceInstance;
