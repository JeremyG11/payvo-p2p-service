import { defaultBlacklistService } from '@gatwech/redis';

// Re-export the shared singleton blacklist service from the @gatwech/redis package.
export const blacklistService = defaultBlacklistService;
