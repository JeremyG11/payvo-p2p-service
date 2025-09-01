import { Request } from "express";
import { UnauthorizedError } from "@/lib/error";

export interface AuthContext {
  userId: string;
  accessToken: string;
}

export function getAuthContext(req: Request): AuthContext {
  const userId = req.userId;
  const accessToken =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace(/^Bearer\s/, "") ||
    req.headers["x-access-token"];

  if (!userId || !accessToken) {
    throw new UnauthorizedError("Authentication required");
  }

  return { userId, accessToken };
}
