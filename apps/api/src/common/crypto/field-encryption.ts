import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * App-level AES-256-GCM encryption for individual sensitive fields (e.g. bank account numbers).
 *
 * Format: "v1.<keyId>.<iv>.<tag>.<ciphertext>" (base64url parts).
 * `aad` binds a ciphertext to its row/column (e.g. "artisan_profiles.accountNumber:<id>"), so a
 * value copied into another row fails to decrypt.
 */
export class FieldEncryption {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly activeKeyId: string,
    activeKeyB64: string,
    previousKeys = '',
  ) {
    this.keys.set(activeKeyId, FieldEncryption.parseKey(activeKeyB64));
    for (const pair of previousKeys.split(',').map((s) => s.trim()).filter(Boolean)) {
      const idx = pair.indexOf(':');
      if (idx < 1) throw new Error('DATA_ENCRYPTION_PREVIOUS_KEYS must be "id:base64,id:base64"');
      const id = pair.slice(0, idx);
      if (!this.keys.has(id)) this.keys.set(id, FieldEncryption.parseKey(pair.slice(idx + 1)));
    }
  }

  private static parseKey(b64: string): Buffer {
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error('Encryption keys must be 32 bytes (base64)');
    return key;
  }

  encrypt(plaintext: string, aad: string): string {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.activeKeyId, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
  }

  decrypt(payload: string, aad: string): string {
    const [version, keyId, ivB64, tagB64, ctB64] = payload.split('.');
    if (version !== 'v1' || !keyId || !ivB64 || !tagB64 || ctB64 === undefined) {
      throw new Error('Malformed ciphertext');
    }
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown encryption key id "${keyId}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** True when the value was written with a key other than the active one (needs re-encryption). */
  needsRotation(payload: string): boolean {
    return payload.split('.')[1] !== this.activeKeyId;
  }
}
