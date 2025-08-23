import {
  RedisModules,
  RedisScripts,
  RedisFunctions,
  RedisClientType,
} from "redis";
import { logger } from "@/lib/logger";
import { getRedis } from "@/config/radis";
import jwt, { JwtPayload } from "jsonwebtoken";

export enum BlacklistType {
  JTI = "jti",
  USER = "uid",
}

/** All blacklist entries live in this single Redis hash. */
const BLACKLIST_HASH_KEY = "blacklist";

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

class BlacklistService {
  //   private client = ;
  private get client(): RedisClientType<
    RedisModules,
    RedisFunctions,
    RedisScripts
  > {
    return getRedis();
  }

  /** Core: add an entry to the hash, then bump the hash TTL. */
  private async add(
    type: BlacklistType,
    id: string,
    metadata: Record<string, unknown>,
    ttlSeconds: number
  ) {
    const field = makeField(type, id);
    await this.client.hSet(
      BLACKLIST_HASH_KEY,
      field,
      JSON.stringify({ timestamp: Date.now(), metadata })
    );
    // Reset the hash TTL so that all entries expire automatically
    await this.client.expire(BLACKLIST_HASH_KEY, ttlSeconds);
    logger.info(`Blacklisted ${field} for ${ttlSeconds}s`, metadata);
  }

  /** Core: check if field exists in the hash. */
  private async is(type: BlacklistType, id: string): Promise<boolean> {
    const field = makeField(type, id);
    const entry = await this.client.hGet(BLACKLIST_HASH_KEY, field);
    if (entry) {
      logger.warn(`Attempt to use blacklisted ${field}`);
      return true;
    }
    return false;
  }

  /** Core: remove a single field from the hash. */
  private async remove(type: BlacklistType, id: string) {
    const field = makeField(type, id);
    await this.client.hDel(BLACKLIST_HASH_KEY, field);
    logger.info(`Removed blacklist entry ${field}`);
  }

  // —— Public API —— //

  /** Blacklist a JWT’s jti until it naturally expires. */
  public async blacklistToken(
    token: string,
    opts: { reason?: string; deviceId?: string; [k: string]: unknown } = {}
  ) {
    const decoded = decodeToken(token);
    const jti = decoded?.jti;
    const exp = decoded?.exp;
    if (!jti || !exp) return;
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;
    if (ttl <= 0) return;
    await this.add(BlacklistType.JTI, jti, opts, ttl);
  }

  /** Is this JWT’s jti currently blacklisted? */
  public async isTokenBlacklisted(token: string): Promise<boolean> {
    const decoded = decodeToken(token);
    return decoded?.jti ? this.is(BlacklistType.JTI, decoded.jti) : false;
  }

  /** Remove a JWT jti from the blacklist (emergency). */
  public async removeTokenJti(jti: string): Promise<void> {
    await this.remove(BlacklistType.JTI, jti);
  }

  /** Globally blacklist a user (e.g. after password reset). */
  public async blacklistUser(
    userId: string,
    ttlSeconds: number,
    opts: { reason?: string } = {}
  ) {
    await this.add(BlacklistType.USER, userId, opts, ttlSeconds);
  }

  /** Is this user globally blacklisted? */
  public async isUserBlacklisted(userId: string): Promise<boolean> {
    return this.is(BlacklistType.USER, userId);
  }

  /** Remove a user from the blacklist. */
  public async removeUser(userId: string): Promise<void> {
    await this.remove(BlacklistType.USER, userId);
  }
}

export const blacklistService = new BlacklistService();
