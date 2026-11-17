import 'server-only';
import type { ApiErrorBody } from '@jiko/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, apiUrl } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Server-side API call with the signed-in user's access token. */
export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect(`/login?next=${encodeURIComponent(path)}`);
  const res = await fetch(`${apiUrl()}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? 'Request failed');
  }
  return body as T;
}
