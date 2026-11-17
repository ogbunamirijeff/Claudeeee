import { NextRequest, NextResponse } from 'next/server';
import { callApi, forbidden, isSameOrigin } from '@/lib/bff';
import { REFRESH_COOKIE, clearSessionCookies } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbidden();
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) await callApi('/v1/auth/logout', { refreshToken }, req).catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
