import 'module-alias/register';
import { logger } from '@/lib/logger';
import { config } from '@/config/env';
import type { CachedAuthData } from '@/types';
import { UnauthenticatedError } from '@gatwech/utils';
import type { Request, Response, NextFunction } from 'express';
import { getAuthUserCachedOrCallAuth } from '@/services/user/user';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization?.replace(/^Bearer\s/, '');

    const cookie = req.headers.cookie;
    const userId = req.headers['x-user-id'];

    if (!userId || typeof userId !== 'string') {
      logger.warn('Missing or invalid X-User-ID header');
      throw new UnauthenticatedError();
    }

    if (!authHeader) {
      logger.warn('Missing or invalid Authorization header');
      throw new UnauthenticatedError();
    }
    let authData: CachedAuthData | null = null;

    const response = await getAuthUserCachedOrCallAuth(
      authHeader,
      cookie,
      config.servicesURLs.auth + `/users/${userId}/permissions`,
      userId
    );
    if (!response.success || !response.data) {
      logger.warn('Failed to validate session with Auth Service');
      throw new UnauthenticatedError();
    }

    authData = response.data;

    if (
      !authData ||
      !authData.user ||
      !Array.isArray(authData.user.permissions)
    ) {
      res.status(403).json({
        code: 'Forbidden',
        message: 'User has no valid permissions.',
      });
      return;
    }

    req.userId = authData.user.id;
    req.userEnumRole = authData.user.role;
    req.userPermissions = authData.user.permissions;

    next();
  } catch (error) {
    logger.error('Unexpected error in authentication middleware:', error);
    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};
