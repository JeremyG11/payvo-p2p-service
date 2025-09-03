import { ICacheService } from '@/types/cache';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Interface for a cache service that strictly handles string-based values.
 * The `set` method returns a boolean indicating success or failure.
 */
interface IStringCacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<boolean>;
}

/**
 * A utility class to safely serialize and deserialize Decimal objects
 * when working with a cache service that only handles native types.
 */
export class DecimalAwareCacheService implements ICacheService {
  /**
   * Constructs the DecimalAwareCacheService, wrapping an underlying cache.
   * @param underlyingCache The base cache service (e.g., a Redis client).
   */
  constructor(private readonly underlyingCache: IStringCacheService) {}

  /**
   * Retrieves an item from the cache and parses any serialized Decimal values.
   * @template T The expected type of the returned value.
   * @param key The cache key.
   * @returns A promise that resolves with the parsed cached item or null.
   */
  public async get<T>(key: string): Promise<T | null> {
    const cachedData = await this.underlyingCache.get(key);
    if (!cachedData) {
      return null;
    }
    // Parse the JSON string and restore Decimal objects.
    return JSON.parse(cachedData, (_, value) => {
      // Check if the value is a string that looks like a Decimal
      if (typeof value === 'string' && /^-?\d*\.?\d+$/.test(value)) {
        return new Decimal(value);
      }
      return value;
    }) as T;
  }

  /**
   * Stores an item in the cache after serializing any Decimal values to strings.
   * @param key The cache key.
   * @param value The value to cache.
   * @param ttl The time-to-live in seconds.
   * @returns A promise that resolves when the item is cached.
   */
  public async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // Stringify the object, converting Decimal instances to strings.
    const stringifiedValue = JSON.stringify(value, (_, val) =>
      val instanceof Decimal ? val.toString() : val
    );
    await this.underlyingCache.set(key, stringifiedValue, ttl);
  }
}
