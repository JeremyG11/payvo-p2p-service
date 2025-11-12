import { config } from '@/config/env';
import { AppError } from '@/lib/error';
import type { CachedAuthData } from '@/types';

/**
 * Fetches a user's permission data from the Auth Service.
 * @param userId the user’s ID from the JWT
 * @param token optional bearer token to forward
 */
export async function fetchUserPermissions(
  userId: string,
  token: string
): Promise<CachedAuthData> {
  const url = `${config.servicesURLs.auth}/users/${userId}/permissions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers });

    console.log(
      `Fetching user permissions for ${userId} from ${url}`,
      JSON.stringify(resp)
    );
    if (!resp.ok) {
      throw new Error(`Auth Service returned ${resp.status}`);
    }
    return resp.json() as Promise<CachedAuthData>;
  } catch (error) {
    console.log(`Error fetching user permissions: ${error}`);

    throw new Error('Failed to fetch user permissions');
  }
}

export const fetchUserById = async (
  userId: string,
  token: string
): Promise<{
  id: string;
  name: string;
  email: string;
  avatar?: string;
}> => {
  const url = `${config.servicesURLs.auth}/users/${userId}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new AppError(`Auth Service returned ${resp.status}`, 503);
    }
    return resp.json();
  } catch (error) {
    throw new AppError('Failed to fetch user by ID', 503);
  }
};
