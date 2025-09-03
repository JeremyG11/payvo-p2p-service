import 'module-alias/register';
import { logger } from '@/lib/logger';
import { verifyJwt } from '@/lib/jwt';
import { CachedAuthData } from '@/types';
import { UserCacheFields } from '@/lib/cache-keys';
import { Request, Response, NextFunction } from 'express';
import { fetchUserPermissions } from '@/services/user/fetch-user';
import { blacklistService } from '@/services/cache/blacklist-cache';
import { userCacheService } from '@/services/cache';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken =
      req.cookies?.accessToken ||
      req.headers.authorization?.replace(/^Bearer\s/, '');

    if (!accessToken) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Access token is missing or invalid.',
      });
      return;
    }

    const { decoded, valid, expired } = verifyJwt(accessToken);

    if (!valid || !decoded || typeof decoded.userId !== 'string') {
      logger.error(`Invalid JWT payload: ${JSON.stringify(decoded)}`);
      res.status(401).json({
        code: 'AuthenticationError',
        message: expired ? 'Token expired' : 'Invalid token',
      });
      return;
    }

    if (await blacklistService.isTokenBlacklisted(decoded.userId)) {
      logger.warn(`Access denied for blacklisted user: ${decoded.userId}`);
      res.status(403).json({
        code: 'UserBlacklisted',
        message: 'User account is suspended.',
      });
      return;
    }

    // Check this specific login session been blacklisted (e.g., via 'log out from all devices')
    if (
      decoded.jti &&
      (await blacklistService.isTokenBlacklisted(accessToken))
    ) {
      logger.warn(
        `Access denied for blacklisted session (jti): ${decoded.jti}`
      );
      res.status(401).json({
        code: 'TokenRevoked',
        message: 'Token has been revoked.',
      });
      return;
    }

    req.userId = decoded.userId;
    res.locals.user = decoded;

    let authData: CachedAuthData | null = null;

    try {
      authData = await userCacheService.getUserData(
        decoded.userId,
        UserCacheFields.AuthData
      );
    } catch (err) {
      logger.error(`Redis error for ${decoded.userId}:`, err);
    }

    // On cache‐miss, fetch from Auth Service and cache it
    if (!authData) {
      try {
        authData = await fetchUserPermissions(decoded.userId, accessToken);
      } catch (err) {
        logger.error(
          `Failed to fetch/cache permissions for ${decoded.userId}:`,
          err
        );
        res.status(503).json({
          code: 'ServiceUnavailable',
          message: 'Unable to retrieve permissions.',
        });
        return;
      }
    }

    if (
      !authData ||
      !authData.enumRole ||
      !Array.isArray(authData.permissions)
    ) {
      res.status(403).json({
        code: 'Forbidden',
        message: 'User has no valid permissions.',
      });
      return;
    }

    req.userEnumRole = authData.enumRole;
    req.userPermissions = authData.permissions;

    next();
  } catch (error) {
    logger.error('Unexpected error in authentication middleware:', error);
    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};
