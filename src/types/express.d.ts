import { Request } from 'express';
import type { JWTPayload } from 'jose';

export interface InternalService {
  type: 'static' | 'jwt';
  claims?: JWTPayload;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userPermissions?: string[];
      userEnumRole?: string;
      merchant?: {
        userId: string;
        email: string;
        category: string;
        isTestKey: boolean;
      };
      cookies: Record<string, string>;

      internalService?: {
        type: 'static' | 'jwt';
        claims?: Record<string, any>;
      };
    }
  }
}
