import { Decimal } from '@prisma/client/runtime/library';

/**
 * Interface for a generic cache service.
 * It is designed to handle different data types including Decimal.
 */
export interface ICacheService {
  /**
   * Retrieves an item from the cache.
   * @template T The expected type of the returned value.
   * @param key The cache key.
   * @returns A promise that resolves with the cached item or null if not found.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores an item in the cache.
   * @param key The cache key.
   * @param value The value to cache.
   * @param ttl The time-to-live in seconds.
   * @returns A promise that resolves when the item is successfully cached.
   */
  set<T>(key: string, value: T, ttl: number): Promise<void>;
}
