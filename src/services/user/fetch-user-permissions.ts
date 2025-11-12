import { config } from "@/config/env";
import type { CachedAuthData } from "@/types";

/**
 * Fetches a user's permission data from the Auth Service.
 * @param userId the user’s ID from the JWT
 * @param token optional bearer token to forward
 */
export async function fetchUserPermissions(
  userId: string,
  token: string
): Promise<CachedAuthData> {
  const url = `${config.servicesURLs.auth}/auth/users/${userId}/permissions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`Auth Service returned ${resp.status}`);
  }
  return resp.json() as Promise<CachedAuthData>;
}
