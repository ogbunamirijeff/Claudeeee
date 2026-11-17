import { GetObjectCommand, HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedUpload, StorageDriver, StoredObject, UploadPolicy } from './storage.driver';

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Any S3-compatible store: AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces… */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async presignUpload(p: UploadPolicy): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: p.bucket,
      Key: p.key,
      Expires: p.expiresInSeconds,
      Fields: { 'Content-Type': p.mimeType },
      Conditions: [
        ['content-length-range', 1, p.maxBytes],
        ['eq', '$Content-Type', p.mimeType],
      ],
    });
    return { url, fields };
  }

  async head(bucket: string, key: string): Promise<StoredObject | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
    } catch (e) {
      if (e instanceof NotFound || (e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  signedGetUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
