import type { ApiErrorBody, AuthTokens } from '@jiko/shared';
import { clearTokens, loadTokens, saveTokens } from './session';

// Android emulator reaches the host at 10.0.2.2; set EXPO_PUBLIC_API_URL for devices.
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody) {
    super(body.message);
  }
}

async function raw(path: string, init: RequestInit & { token?: string } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000); // slow 3G, but don't hang forever
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError({
      statusCode: 0,
      code: 'NETWORK',
      message: 'No connection. Check your data and try again.',
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body as ApiErrorBody);
  return body as T;
}

export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(await raw(path, { method: 'POST', body: JSON.stringify(body) }));
}

let refreshing: Promise<AuthTokens | null> | null = null;

async function refresh(): Promise<AuthTokens | null> {
  // Single-flight: parallel 401s share one rotation (a second rotation would trip reuse detection).
  refreshing ??= (async () => {
    const current = await loadTokens();
    if (!current) return null;
    const res = await raw('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return null;
    }
    const next = (await res.json()) as AuthTokens;
    await saveTokens(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Authenticated request; refreshes once on 401. Throws ApiError UNAUTHENTICATED if signed out. */
export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  let tokens = await loadTokens();
  if (!tokens)
    throw new ApiError({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sign in to continue',
    });
  let res = await raw(path, { ...init, token: tokens.accessToken });
  if (res.status === 401) {
    tokens = await refresh();
    if (!tokens)
      throw new ApiError({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue',
      });
    res = await raw(path, { ...init, token: tokens.accessToken });
  }
  return parse<T>(res);
}

export async function logout() {
  const tokens = await loadTokens();
  await clearTokens();
  if (tokens)
    await raw('/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => undefined);
}
