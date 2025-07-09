import { logger } from "@/lib/logger";
import { CachedAuthData } from "@/types";
import { redis as RedisClient } from "@/config/radis";

 
/**
 *  Fetches user permissions from caches Redis.
 * @param userId
 * @returns
 */
export async function getUserPermissions(
  userId: string
): Promise<CachedAuthData | null> {
  const redis = RedisClient();
  if (!userId) {
    logger.warn("getUserPermissions called without userId");
    return null;
  }
  const redisKey = `user:${userId}:auth_data`;
  let cachedAuthData: CachedAuthData | null = null;

  try {
    const cachedDataString = await redis.get(redisKey);
    if (cachedDataString) {
      cachedAuthData = JSON.parse(cachedDataString.toString());
      logger.debug(`User ${userId} auth data found in Redis.`);
    }
  } catch (redisError) {
    logger.error(`Error accessing Redis for user ${userId}:`, redisError);
  }

  return null;
}
