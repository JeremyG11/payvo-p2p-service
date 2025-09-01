import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";

export { OrderStatus, AdStatus, UserRole } from "@prisma/client";

export interface OrderApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface OrderBook {
  bids: { price: Decimal; amount: Decimal }[];
  asks: { price: Decimal; amount: Decimal }[];
}

export interface PriceTicker {
  pair: string;
  lastPrice: Decimal;
  high24h: Decimal;
  low24h: Decimal;
  volume24h: Decimal;
  change24h: Decimal;
}
