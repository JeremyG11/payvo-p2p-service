import { logger } from "@/lib/logger";
import { config } from "@/config/env";
import jwt, { JwtPayload } from "jsonwebtoken";

interface VerificationResult {
  valid: boolean;
  expired: boolean;
  decoded: JwtPayload | null;
}

export function verifyJwt(token: string): VerificationResult {
  try {
    const publicKey = config.jwtPublicKey;

    if (!publicKey) {
      logger.error(
        "JWT public key is not defined in the environment variables."
      );
      throw new Error("JWT public key is not defined.");
    }
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["ES256"],
    }) as JwtPayload;

    return { valid: true, expired: false, decoded };
  } catch (e: any) {
    const isExpired = e.message === "jwt expired";

    if (isExpired) {
      logger.warn(`Expired JWT received: ${token.substring(0, 20)}...`);
    } else {
      logger.warn(
        `Invalid JWT received: ${token.substring(0, 20)}... Error: ${e.message}`
      );
    }
    return {
      valid: false,
      expired: isExpired,
      decoded: null,
    };
  }
}
