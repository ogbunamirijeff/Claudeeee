import { type NextRequest, NextResponse } from 'next/server';
import { refreshTokens } from './lib/refresh';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './lib/session';

const PROTECTED = ['/account', '/admin', '/book', '/jobs'];

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

  const tokens = await refreshTokens(refresh);
  if (!tokens) return toLogin();

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

export const config = {
  matcher: ['/account/:path*', '/admin/:path*', '/book/:path*', '/jobs/:path*'],
};
