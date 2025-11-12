import { config } from '@/config/env';
import { importSPKI, jwtVerify } from 'jose';
import fs from 'fs/promises';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { JWTPayload } from 'jose';

export const AUTH_SCHEMES = {
  BEARER: 'Bearer ',
  SERVICE: 'Service ',
};

/**
 * Cache the public key in memory to avoid reading from disk on every request.
 */
let cachedKey: string | null = null;

/**
 * Replaces literal '\n' sequences with real newline characters in a PEM key.
 */
function sanitizePemKey(key: string): string {
  if (key.includes('\\n')) {
    console.info(
      'Sanitizing JWT public key: replaced \\n with newline characters.'
    );
    return key.replace(/\\n/g, '\n');
  }
  return key;
}

/**
 * Retrieves the public key for JWT verification.
 * - First tries to read from file (JWT_PUBLIC_KEY_PATH / JWT_PUBLIC_KEY_FILE)
 * - Falls back to env variable (JWT_PUBLIC_KEY_PEM or config.jwtPublicKey)
 * - Caches the result in memory
 */
export async function getPublicKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;

  const publicKeyPath =
    process.env.JWT_PUBLIC_KEY_PATH || process.env.JWT_PUBLIC_KEY_FILE;

  let key: string | null = null;

  if (publicKeyPath) {
    try {
      key = await fs.readFile(publicKeyPath, 'utf8');
      key = sanitizePemKey(key);
      cachedKey = key;
      return key;
    } catch (error) {
      console.warn(
        `Failed to read JWT public key from path: ${publicKeyPath}. Falling back to env variable.`,
        error
      );
    }
  }

  const keyFromEnv = config.jwtPublicKey || process.env.JWT_PUBLIC_KEY_PEM;
  if (keyFromEnv) {
    key = sanitizePemKey(keyFromEnv);
    cachedKey = key;
    return key;
  }

  console.error('No JWT public key found in file or environment.');
  return null;
}

/**
 * Validates a JWT token against the configured public key and issuer/audience.
 * @param token - The JWT string to validate.
 * @returns The JWT payload if valid, otherwise null.
 */
async function validateJwtToken(token: string): Promise<JWTPayload | null> {
  const publicKeyPem = await getPublicKey();
  if (!publicKeyPem) {
    console.error('JWT validation skipped: Public key is not configured.');
    return null;
  }

  try {
    const key = await importSPKI(publicKeyPem, 'ES256');
    const { payload } = await jwtVerify(token, key, {
      issuer: config.authIssuer,
      audience: 'payvo-services',
    });
    return payload;
  } catch (err) {
    console.error(
      'JWT validation failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return null;
  }
}

/**
 * Validates a static service token.
 * @param authHeader - The full Authorization header string.
 * @returns True if the static token is valid, otherwise false.
 */
function validateStaticToken(authHeader: string): boolean {
  if (
    !config.internalServiceToken ||
    !authHeader.startsWith(AUTH_SCHEMES.SERVICE)
  ) {
    return false;
  }
  const token = authHeader.slice(AUTH_SCHEMES.SERVICE.length).trim();
  return token === config.internalServiceToken;
}

/**
 * Express middleware to authenticate internal service-to-service calls.
 * It checks for a static 'Service' token or a 'Bearer' JWT.
 */
export const internalAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.get('authorization') ?? '';

  // If no auth methods are configured, skip the middleware.
  if (
    !config.internalServiceToken &&
    !process.env.JWT_PUBLIC_KEY_PEM &&
    !process.env.JWT_PUBLIC_KEY_PATH
  ) {
    return next();
  }

  // Attempt static token validation
  if (validateStaticToken(authHeader)) {
    req.internalService = { type: 'static' };
    return next();
  }

  // Attempt JWT validation
  if (authHeader.startsWith(AUTH_SCHEMES.BEARER)) {
    const token = authHeader.slice(AUTH_SCHEMES.BEARER.length).trim();
    const payload = await validateJwtToken(token);

    if (payload) {
      req.internalService = { type: 'jwt', claims: payload };
      return next();
    }
  }

  return res
    .status(401)
    .json({ code: 'Unauthorized', message: 'Invalid credentials' });
};
