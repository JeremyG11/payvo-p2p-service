import { AppError } from '@/lib/error';
import { config } from '@/config/env';
import { getAuthContext } from '@/lib/utils/helpers';

export const fetchAgents = async (
  token: string,
  queryParams?: Record<string, any>
): Promise<{
  agents: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}> => {
  const url = `${config.servicesURLs.auth}/users/agents`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // Build URL with query parameters
    const urlWithParams = new URL(url);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          urlWithParams.searchParams.append(key, value.toString());
        }
      });
    }

    const resp = await fetch(urlWithParams.toString(), { headers });
    if (!resp.ok) {
      throw new AppError(`User Service returned ${resp.status}`, 503);
    }

    return resp.json();
  } catch (error) {
    throw new AppError('Failed to fetch agents', 503);
  }
};

export const fetchAgentById = async (
  userId: string,
  token: string
): Promise<any> => {
  const url = `${config.servicesURLs.auth}/agents/${userId}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new AppError(`User Service returned ${resp.status}`, 503);
    }
    return resp.json();
  } catch (error) {
    throw new AppError('Failed to fetch agent by ID', 503);
  }
};
