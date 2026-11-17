import { type NextRequest, NextResponse } from 'next/server';
import type { AuthTokens } from '@jiko/shared';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  apiUrl,
  clearSessionCookies,
  setSessionCookies,
} from './lib/session';

const PROTECTED = ['/account', '/admin'];

/**
 * Keeps sessions alive: when the short-lived access cookie has expired but a refresh cookie
 * exists, rotate tokens before the page renders.
 */
export async function middleware(req: NextRequest) {
  const needsAuth = PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (access) return NextResponse.next();

  const toLogin = () => {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    const res = NextResponse.redirect(url);
    clearSessionCookies(res);
    return res;
  };
  if (!refresh) return toLogin();

  const r = await fetch(`${apiUrl()}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
    cache: 'no-store',
  });
  if (!r.ok) return toLogin();
  const tokens = (await r.json()) as AuthTokens;

  // Re-run the request with the new cookie so server components see it immediately.
  const headers = new Headers(req.headers);
  headers.set(
    'cookie',
    `${ACCESS_COOKIE}=${tokens.accessToken}; ${REFRESH_COOKIE}=${tokens.refreshToken}`,
  );
  const res = NextResponse.next({ request: { headers } });
  setSessionCookies(res, tokens);
  return res;
}

export const config = { matcher: ['/account/:path*', '/admin/:path*'] };
