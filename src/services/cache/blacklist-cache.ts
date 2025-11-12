import { defaultBlacklistService } from '@payvo/redis';

// Re-export the shared singleton blacklist service from the @payvo/redis package.
export const blacklistService = defaultBlacklistService;
