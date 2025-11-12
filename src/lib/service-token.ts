import axios from 'axios';

let cached = { token: '', exp: 0 };

export async function getServiceToken() {
  if (cached.token && Date.now() < cached.exp - 30_000) return cached.token;

  const authUrl =
    process.env.AUTH_SERVICE_URL || 'http://localhost:5001/api/v1/auth';
  const resp = await axios.post(
    `${authUrl.replace(/\/$/, '')}/internal/token`,
    {},
    {
      headers: { Authorization: `Service ${process.env.SERVICE_API_KEY}` },
      timeout: 2000,
    }
  );

  const { access_token, expires_in } = resp.data;
  cached.token = access_token;
  cached.exp = Date.now() + expires_in * 1000;
  return cached.token;
}
