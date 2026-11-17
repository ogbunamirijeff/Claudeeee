export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface UploadPolicy {
  bucket: string;
  key: string;
  mimeType: string;
  maxBytes: number;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * Clients upload straight to storage (never through the API) using a short-lived signed POST
 * whose policy fixes the key, content type and maximum size.
 */
export interface StorageDriver {
  readonly name: string;
  presignUpload(p: UploadPolicy): Promise<PresignedUpload>;
  head(bucket: string, key: string): Promise<StoredObject | null>;
  signedGetUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;
}
