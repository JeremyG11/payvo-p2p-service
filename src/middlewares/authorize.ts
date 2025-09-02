/**
 * Express middleware factory for role and permission-based authorization.
 *
 * This middleware checks if the authenticated user has the required role and/or permissions
 * to access a route. It supports hierarchical role checks and granular permission checks.
 *
 * @param options - Authorization options.
 * @param options.requiredPermissions - Array of permission strings required to access the route.
 * @param options.minRole - Minimum user role required to access the route.
 *
 * @returns Express middleware function that enforces authorization rules.
 *
 * @example
 * // Require ADMIN role or higher
 * app.get('/admin', authorize({ minRole: PrismaUserRole.ADMIN }), handler);
 *
 * @example
 * // Require specific permissions
 * app.post('/resource', authorize({ requiredPermissions: ['resource:create'] }), handler);
 *
 * @remarks
 * - If `requiredPermissions` is empty or the user is a SUPER_ADMIN, permission checks are bypassed.
 * - If `minRole` is specified, the user's role must be at least the specified role.
 * - Responds with 401 if authentication data is missing.
 * - Responds with 403 if authorization fails.
 * - Responds with 500 if roles/permissions data is unavailable or on internal error.
 */
import { logger } from '@/lib/logger';
import { Request, Response, NextFunction } from 'express';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { appCacheService } from '@/services/cache/app-cache';

interface AuthorizeOptions {
  requiredPermissions?: string[];
  minRole?: PrismaUserRole;
}

export const authorize = (options: AuthorizeOptions = {}) => {
  const { requiredPermissions = [], minRole } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rolesPermissions = await appCacheService.getRolesAndPermissions();

      if (!rolesPermissions) {
        logger.error('Roles and permissions data is not available in cache.');
        res.status(500).json({
          code: 'ServerError',
          message: 'Roles and permissions data is not available.',
        });
        return;
      }

      if (
        !req.userId ||
        req.userEnumRole === undefined ||
        !req.userPermissions
      ) {
        res.status(401).json({
          code: 'AuthenticationError',
          message:
            'Authentication required. Missing user ID, role, or permissions.',
        });
        return;
      }

      const roleHierarchy: Record<PrismaUserRole, number> = {
        [PrismaUserRole.SUPER_ADMIN]: 4,
        [PrismaUserRole.ADMIN]: 3,
        [PrismaUserRole.AGENT]: 2,
        [PrismaUserRole.MODERATOR]: 2,
        [PrismaUserRole.USER]: 1,
      };

      const currentUserRoleLevel =
        roleHierarchy[req.userEnumRole as PrismaUserRole];

      if (minRole !== undefined) {
        const minRequiredRoleLevel = roleHierarchy[minRole];
        if (currentUserRoleLevel < minRequiredRoleLevel) {
          res.status(403).json({
            code: 'AuthorizationError',
            message: 'Access denied, insufficient role level.',
          });
          return;
        }
      }

      if (
        requiredPermissions.length === 0 ||
        req.userEnumRole === PrismaUserRole.SUPER_ADMIN
      ) {
        next();
        return;
      }

      const hasAllRequiredPermissions = requiredPermissions.every(
        (permission) => req.userPermissions.includes(permission)
      );

      logger.debug(
        `User ${req.userId} permissions: ${hasAllRequiredPermissions}`
      );

      if (!hasAllRequiredPermissions) {
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Access denied, insufficient granular permissions.',
        });
        return;
      }

      next();
      return;
    } catch (error) {
      logger.error('Error in authorization middleware:', error);
      res.status(500).json({
        code: 'ServerError',
        message: 'Internal server error during authorization.',
      });
      return;
    }
  };
};
