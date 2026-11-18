import { type NextRequest, NextResponse } from 'next/server';
import { forbidden, isSameOrigin } from '@/lib/bff';
import { refreshTokens } from '@/lib/refresh';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  apiUrl,
  clearSessionCookies,
  setSessionCookies,
} from '@/lib/session';

/**
 * Same-origin proxy for authenticated API calls from the browser. The access token lives in an
 * httpOnly cookie, so page scripts never see it; this handler attaches it server-side.
 */
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (req.method !== 'GET' && !isSameOrigin(req)) return forbidden();
  const { path } = await ctx.params;
  if (path.some((p) => p === '..' || p.includes('/'))) return forbidden();

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  let rotated = null;
  if (!access) {
    const rt = req.cookies.get(REFRESH_COOKIE)?.value;
    rotated = rt ? await refreshTokens(rt) : null;
    if (!rotated) {
      const res = NextResponse.json(
        { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Sign in to continue' },
        { status: 401 },
      );
      clearSessionCookies(res);
      return res;
    }
    access = rotated.accessToken;
  }

  const upstream = await fetch(
    `${apiUrl()}/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`,
    {
      method: req.method,
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
        'user-agent': req.headers.get('user-agent') ?? '',
      },
      body: req.method === 'GET' ? undefined : await req.text(),
      cache: 'no-store',
    },
  );
  const body = upstream.status === 204 ? null : await upstream.text();
  const res = new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
  if (rotated) setSessionCookies(res, rotated);
  return res;
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
