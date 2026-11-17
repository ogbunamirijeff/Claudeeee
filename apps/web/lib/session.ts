import type { AuthTokens } from '@jiko/shared';
import type { NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'jiko_at';
export const REFRESH_COOKIE = 'jiko_rt';

export const apiUrl = () => process.env.API_URL ?? 'http://localhost:4000';

const base = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

/** Tokens live only in httpOnly cookies, so page scripts (and XSS) can't read them. */
export function setSessionCookies(res: NextResponse, t: AuthTokens) {
  const secs = (iso: string) => Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  res.cookies.set(ACCESS_COOKIE, t.accessToken, {
    ...base(),
    maxAge: secs(t.accessTokenExpiresAt) - 30,
  });
  res.cookies.set(REFRESH_COOKIE, t.refreshToken, {
    ...base(),
    maxAge: secs(t.refreshTokenExpiresAt),
  });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...base(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { ...base(), maxAge: 0 });
}
