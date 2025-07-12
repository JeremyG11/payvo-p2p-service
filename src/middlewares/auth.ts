import axios from "axios";
import "module-alias/register";
import { verifyJwt } from "@/lib/jwt";
import { logger } from "@/lib/logger";
import { CachedAuthData } from "@/types";
import { Request, Response, NextFunction } from "express";
import { getUserPermissions } from "@/lib/redis/get-user-permissions";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken =
      (req.cookies && req.cookies.accessToken) ||
      (req.headers.authorization &&
        req.headers.authorization.replace(/^Bearer\s/, ""));

    if (!accessToken) {
      res.status(401).json({
        code: "AuthenticationError",
        message: "Access token is missing or invalid.",
      });
      return;
    }

    const { decoded, valid, expired } = verifyJwt(accessToken);

    if (!valid || !decoded) {
      res.status(401).json({
        code: "AuthenticationError",
        message: expired ? "Token expired" : "Invalid token",
      });
      return;
    }

    if (typeof decoded.userId !== "string") {
      logger.error(
        `JWT payload ID is not a string: ${JSON.stringify(decoded)}`
      );
      res.status(401).json({
        code: "AuthenticationError",
        message: "Unauthenticated: Invalid token.",
      });
      return;
    }

    req.userId = decoded.userId;
    res.locals.user = decoded;

    let cachedAuthData: CachedAuthData | null = null;

    try {
      cachedAuthData = await getUserPermissions(req.userId);
    } catch (redisError) {
      logger.error(`Error accessing Redis for user ${req.userId}:`, redisError);
    }

    if (!cachedAuthData) {
      logger.info(
        `User ${req.userId} auth data not in Redis, fetching from Auth Service.`
      );
      try {
        const authServiceResponse = await axios.get<CachedAuthData>(
          `https://api.e-flavours.com/api/v1/auth/users/${req.userId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        cachedAuthData = authServiceResponse.data;

        // Extract and assign role and permissions after fetching from Auth Service
        if (cachedAuthData && cachedAuthData.user && cachedAuthData.user.role) {
          req.userEnumRole = cachedAuthData.user.role.name; // Assign the role (enumRole)
          req.userPermissions = cachedAuthData.user.role.rolePermissions.map(
            (permission: any) => permission.permission.name
          ); // Map the permissions to an array of permission names
        }
      } catch (authServiceError) {
        logger.error(
          `Failed to fetch user data from Auth Service for ${req.userId}:`,
          authServiceError
        );
        res.status(403).json({
          code: "Forbidden",
          message: "User does not have valid permissions.",
        });
        return;
      }
    }

    if (!cachedAuthData || !req.userEnumRole || !req.userPermissions) {
      logger.error(
        `No authentication data found for user ${req.userId} after all attempts.`
      );
      res.status(403).json({
        code: "Forbidden",
        message: "User does not have valid permissions.",
      });
      return;
    }

    next();
  } catch (error) {
    logger.error(
      "Error in authentication middleware outside of specific JWT/auth issues:",
      error
    );
    res
      .status(500)
      .json({ code: "ServerError", message: "Internal server error" });
  }
};
