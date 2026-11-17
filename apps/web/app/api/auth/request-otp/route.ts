import { type NextRequest, NextResponse } from 'next/server';
import { callApi, forbidden, isSameOrigin } from '@/lib/bff';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbidden();
  const res = await callApi('/v1/auth/otp/request', await req.json().catch(() => ({})), req);
  return NextResponse.json(await res.json(), { status: res.status });
}
