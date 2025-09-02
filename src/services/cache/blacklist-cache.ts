import { logger } from '@/lib/logger';
import { HashCacheService } from '@payvo/redis';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '@/config/env';

export enum BlacklistType {
  JTI = 'jti',
  USER = 'uid',
}

/** All blacklist entries live in this single Redis hash. */
const BLACKLIST_HASH_KEY = 'blacklist';

/** Build the field name inside the hash (e.g. `jti:abc123`). */
function makeField(type: BlacklistType, id: string) {
  return `${type}:${id}`;
}

/** Decode without verifying so we can read `jti` and `exp`. */
function decodeToken(token: string): (JwtPayload & { jti?: string }) | null {
  try {
    return jwt.decode(token) as any;
  } catch {
    return null;
  }
}

class ReadOnlyBlacklistService {
  private hashCache: HashCacheService;
  private isInitialized = false;

  constructor() {
    const redisUrl = config.redisUrl;
    if (!redisUrl) {
      logger.warn(
        'REDIS_URL environment variable is not defined - blacklist functionality will be disabled'
      );
      return;
    }

    try {
      this.hashCache = new HashCacheService(redisUrl, { logger });
      this.isInitialized = true;
      logger.info('ReadOnlyBlacklistService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ReadOnlyBlacklistService', { error });
      this.isInitialized = false;
    }
  }

  /** Core: check if field exists in the hash. */
  private async is(type: BlacklistType, id: string): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('Blacklist service not available - skipping blacklist check');
      return false;
    }

    const field = makeField(type, id);
    try {
      const entry = await this.hashCache.getField<any>(
        BLACKLIST_HASH_KEY,
        field
      );
      if (entry) {
        logger.warn(`Attempt to use blacklisted ${field}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to check blacklist', { error, type, id });
      return false;
    }
  }

  /** Is this JWT's jti currently blacklisted? */
  public async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    const decoded = decodeToken(token);
    return decoded?.jti ? this.is(BlacklistType.JTI, decoded.jti) : false;
  }

  /** Is this user globally blacklisted? */
  public async isUserBlacklisted(userId: string): Promise<boolean> {
    if (!this.isInitialized) {
      return false; // If blacklist service is down, assume user is not blacklisted
    }

    return this.is(BlacklistType.USER, userId);
  }

  /** Check if the service is available */
  public isAvailable(): boolean {
    return this.isInitialized;
  }
}

// Initialize the service
let blacklistServiceInstance: ReadOnlyBlacklistService | null = null;

try {
  blacklistServiceInstance = new ReadOnlyBlacklistService();
} catch (error) {
  logger.error('Failed to initialize ReadOnlyBlacklistService', { error });
}

export const blacklistService = blacklistServiceInstance;
