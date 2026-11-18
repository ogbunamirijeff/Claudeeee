import type { AuthTokens } from '@jiko/shared';
import { apiUrl } from './session';

/** Exchanges a refresh token for a new pair; null if the session is over. */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
  const r = await fetch(`${apiUrl()}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  return r.ok ? ((await r.json()) as AuthTokens) : null;
}
