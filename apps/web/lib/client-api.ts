'use client';

import type { ApiErrorBody, UploadTicket } from '@jiko/shared';

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Browser → same-origin proxy (/api/v1/*) → API. */
export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data as Partial<ApiErrorBody>;
    if (res.status === 401)
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiFailure(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong');
  }
  return data as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

/**
 * Shrinks a photo on the device before upload (max 1600px, JPEG ~75%), so a 4 MB camera photo
 * becomes ~200 KB — the difference between seconds and minutes on 3G.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not process photo'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** Ticket from the API → direct upload to storage → confirm. Returns the file id. */
export async function uploadPhoto(blob: Blob, kind: string, jobId?: string): Promise<string> {
  const ticket = await api<UploadTicket>('/files/uploads', {
    method: 'POST',
    body: { kind, mimeType: 'image/jpeg', sizeBytes: blob.size, ...(jobId ? { jobId } : {}) },
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) form.append(k, v);
  form.append('file', blob, 'photo.jpg');
  const up = await fetch(ticket.url, { method: 'POST', body: form });
  if (!up.ok)
    throw new ApiFailure(
      up.status,
      'UPLOAD_FAILED',
      'Photo upload failed. Check your connection and try again.',
    );
  await api(`/files/${ticket.fileId}/complete`, { method: 'POST' });
  return ticket.fileId;
}
