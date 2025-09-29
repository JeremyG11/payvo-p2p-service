import { Request } from 'express';
import { User } from '@prisma/client';

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
    }
    interface Response {
      user?: User;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    currentChallenge?: string;
    passkeyRegistrationUserId?: string;
  }
}

declare module 'express' {
  interface Request {
    session: Express.Session & Express.SessionData;
  }
}
