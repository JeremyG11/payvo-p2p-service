import { logger } from "@/lib/logger";
import { redis } from "@/config/radis";
import jwt, { JwtPayload } from "jsonwebtoken";

const BLACKLIST_JTI_PREFIX = "bl:jti:";
const BLACKLIST_USER_PREFIX = "bl:uid:";

/** Build the Redis key for a given jti */
function jtiKey(jti: string) {
  return `${BLACKLIST_JTI_PREFIX}${jti}`;
}

/** Build the Redis key for a given userId */
function userKey(userId: string) {
  return `${BLACKLIST_USER_PREFIX}${userId}`;
}

/** Decode a token’s payload (without verifying) */
function decodeToken(token: string): (JwtPayload & { jti?: string }) | null {
  try {
    return jwt.decode(token) as (JwtPayload & { jti?: string }) | null;
  } catch {
    return null;
  }
}

/**
 * Is this token’s jti blacklisted?
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const decoded = decodeToken(token);
  const jti = decoded?.jti;
  if (!jti) return false;

  const data = await redis().get(jtiKey(jti));
  if (data) logger.warn(`Attempt to use blacklisted token jti=${jti}`);
  return !!data;
}

/**
 * Remove a blacklisted jti i.e, emergency
 */
export async function removeBlacklistedJti(jti: string): Promise<void> {
  await redis().del(jtiKey(jti));
  logger.info(`Removed blacklisted jti=${jti}`);
}

/**
 * Is this user globally blacklisted?
 */
export async function isUserBlacklisted(userId: string): Promise<boolean> {
  const data = await redis().get(userKey(userId));
  if (data) logger.warn(`Blacklisted user access attempt userId=${userId}`);
  return !!data;
}
