import { ConflictError } from "@/lib/error";
import RedisClient from "@payvo/redis";

export class RateLimitingService {
  private readonly ORDER_RATE_LIMIT_WINDOW_S = 60;
  private readonly MAX_ORDERS_PER_MINUTE = 10;

  constructor(private redis: RedisClient) {
    this.redis = redis;
  }

  // rate limiting logic
}
