import axios from 'axios';
import { userCacheService } from '../cache';
import type { CachedAuthData } from '@/types';
import { UserCacheFields } from '@/lib/cache-keys';

/**
 * Universal helper to validate opaque session tokens.
 */
export async function getAuthUserCachedOrCallAuth(
  internalToken: string,
  cookies: any,
  url: string,
  userId: string
): Promise<{ success: boolean; data: CachedAuthData | null }> {
  try {
    const cached = await userCacheService.getUserData<CachedAuthData>(
      userId,
      UserCacheFields.AuthData
    );

    if (cached) return { success: true, data: cached };
  } catch (err: any) {
    console.warn('[SessionCache] Read failed:', err.message);
  }

  const headers: Record<string, string> = {};

  try {
    if (internalToken) {
      headers['x-internal-authorization'] = `Bearer ${internalToken}`;
    }
    if (cookies) headers['cookie'] = `${cookies}`;
  } catch (err: any) {
    console.warn('[SessionCache] Could not mint internal JWT:', err.message);
  }

  try {
    const resp = await axios.get(url, { headers });
    if (resp.status !== 200) return { success: false, data: null };

    const data = resp.data;
    console.debug('Auth-service call success:', data);
    return { success: true, data };
  } catch (err: any) {
    console.warn('[SessionCache] Auth-service call failed:', err.message);
    return { success: false, data: null };
  }
}
