import { logger } from '@/lib/logger';
import { config } from '@/config/env';
import { jwtVerify, importSPKI, importJWK, type JWTPayload } from 'jose';

interface VerificationResult {
  valid: boolean;
  expired: boolean;
  decoded: JWTPayload | null;
}

export async function verifyJwt(
  token: string,
  keyOverride?: string | Uint8Array
): Promise<VerificationResult> {
  try {
    const publicKey = config.jwtPublicKey!;

    if (!publicKey && !keyOverride) {
      throw new Error('JWT public key is not defined.');
    }

    let keyToUse: any;

    if (keyOverride instanceof Uint8Array) {
      throw new Error(
        'Uint8Array key not supported for ES256; use PEM or JWK.'
      );
    } else if (typeof keyOverride === 'string') {
      keyToUse = await importSPKI(keyOverride, 'ES256');
    } else if (publicKey.trim().startsWith('{')) {
      // JSON Web Key (JWK) format
      const jwk = JSON.parse(publicKey);
      keyToUse = await importJWK(jwk, 'ES256');
    } else {
      // PEM (SPKI) format
      keyToUse = await importSPKI(publicKey, 'ES256');
    }

    const { payload } = await jwtVerify(token, keyToUse);

    return {
      valid: true,
      expired: false,
      decoded: payload,
    };
  } catch (e: any) {
    const isExpired =
      e.code === 'ERR_JWT_EXPIRED' ||
      e.message.toLowerCase().includes('expired');

    logger.warn(
      `${isExpired ? 'Expired' : 'Invalid'} JWT received: ${token.substring(
        0,
        20
      )}... Error: ${e.message}`
    );

    return {
      valid: false,
      expired: isExpired,
      decoded: null,
    };
  }
}
