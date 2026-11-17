import { type NextRequest, NextResponse } from 'next/server';
import { apiUrl } from './session';

/** Same-origin check for cookie-authenticated POSTs (CSRF defence on top of SameSite=Lax). */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const forbidden = () =>
  NextResponse.json(
    { statusCode: 403, code: 'BAD_ORIGIN', message: 'Request blocked' },
    { status: 403 },
  );

export async function callApi(path: string, body: unknown, req: NextRequest) {
  return fetch(`${apiUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Forward the client IP so the API's per-IP OTP limits see the real user.
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}
