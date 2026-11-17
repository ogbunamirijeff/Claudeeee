import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { PresignedUpload, StorageDriver, StoredObject, UploadPolicy } from './storage.driver';

interface UploadClaims {
  t: 'up';
  b: string;
  k: string;
  m: string;
  max: number;
  exp: number;
}
interface DownloadClaims {
  t: 'down';
  b: string;
  k: string;
  exp: number;
}

/**
 * Development/test storage: files on local disk, uploads and downloads through API endpoints
 * authorised by HMAC-signed tokens that mimic S3's presigned URLs. Refused in production.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicApiUrl: string,
    private readonly secret: string,
  ) {
    this.root = resolve(rootDir);
  }

  private sign(claims: UploadClaims | DownloadClaims): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const mac = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  verify<T extends UploadClaims | DownloadClaims>(token: string, type: T['t']): T | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
    if (claims.t !== type || claims.exp < Date.now() / 1000) return null;
    return claims;
  }

  /** Resolve inside the storage root only (no path traversal through crafted keys). */
  path(bucket: string, key: string): string {
    const p = resolve(this.root, bucket, key);
    if (!p.startsWith(this.root + sep)) throw new Error('Invalid storage path');
    return p;
  }

  presignUpload(p: UploadPolicy): Promise<PresignedUpload> {
    const exp = Math.floor(Date.now() / 1000) + p.expiresInSeconds;
    const token = this.sign({
      t: 'up',
      b: p.bucket,
      k: p.key,
      m: p.mimeType,
      max: p.maxBytes,
      exp,
    });
    return Promise.resolve({
      url: `${this.publicApiUrl}/v1/files/local-upload`,
      fields: { token, 'Content-Type': p.mimeType },
    });
  }

  async write(bucket: string, key: string, data: Buffer, contentType: string): Promise<void> {
    const file = this.path(bucket, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async read(bucket: string, key: string): Promise<{ data: Buffer; contentType: string } | null> {
    try {
      const file = this.path(bucket, key);
      const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8')) as {
        contentType: string;
      };
      return { data: await readFile(file), contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  async head(bucket: string, key: string): Promise<StoredObject | null> {
    try {
      const file = this.path(bucket, key);
      const s = await stat(file);
      const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8')) as {
        contentType: string;
      };
      return { sizeBytes: s.size, contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  signedGetUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return Promise.resolve(
      `${this.publicApiUrl}/v1/files/local/${this.sign({ t: 'down', b: bucket, k: key, exp })}`,
    );
  }
}

export type { UploadClaims, DownloadClaims };
export const joinKey = (...parts: string[]) =>
  join(...parts)
    .split(sep)
    .join('/');
