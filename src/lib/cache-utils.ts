import { logger } from "@/lib/logger";
import { AppCacheFields } from "@/lib/cache-keys";
import { redisCacheService } from "@/services/cache";

/**
 * Fetches the cached roles and permissions from Redis.
 * If not found, throws an error indicating the data is missing.
 * This function does not fall back to the database.
 */

export async function getAppRolesPermissionsFromRedis(): Promise<
  { id: string; name: string; permissions: string[] }[]
> {
  try {
    const cached = await redisCacheService.getAppData<any[]>(
      AppCacheFields.RolesPermissions
    );

    if (cached) {
      logger.debug("App roles/permissions hit in cache");
      return cached;
    }

    throw new Error(
      "RBAC data not found in Redis. Auth service may not be running or data may not be loaded yet."
    );
  } catch (error) {
    logger.error("Failed to get RBAC data from Redis", error);
    throw error;
  }
}
