import { type NextRequest, NextResponse } from 'next/server';
import type { VerifyOtpResponse } from '@jiko/shared';
import { callApi, forbidden, isSameOrigin } from '@/lib/bff';
import { setSessionCookies } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbidden();
  const res = await callApi('/v1/auth/otp/verify', await req.json().catch(() => ({})), req);
  const body: unknown = await res.json();
  if (!res.ok) return NextResponse.json(body, { status: res.status });

  const data = body as VerifyOtpResponse;
  // Tokens go into httpOnly cookies; the browser only gets the user.
  const out = NextResponse.json({ user: data.user, isNewUser: data.isNewUser });
  setSessionCookies(out, data);
  return out;
}
