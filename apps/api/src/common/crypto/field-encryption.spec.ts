import { randomBytes } from 'node:crypto';
import { FieldEncryption } from './field-encryption';

const k = () => randomBytes(32).toString('base64');

describe('FieldEncryption', () => {
  const key1 = k();
  const enc = new FieldEncryption('k1', key1);
  const aad = 'artisan_profiles.accountNumber:abc';

  it('round-trips and never contains the plaintext', () => {
    const ct = enc.encrypt('0123456789', aad);
    expect(ct).not.toContain('0123456789');
    expect(ct.startsWith('v1.k1.')).toBe(true);
    expect(enc.decrypt(ct, aad)).toBe('0123456789');
  });

  it('uses a fresh IV each time', () => {
    expect(enc.encrypt('0123456789', aad)).not.toBe(enc.encrypt('0123456789', aad));
  });

  it('rejects a ciphertext moved to another row (AAD mismatch)', () => {
    const ct = enc.encrypt('0123456789', aad);
    expect(() => enc.decrypt(ct, 'artisan_profiles.accountNumber:other')).toThrow();
  });

  it('rejects tampering', () => {
    const ct = enc.encrypt('0123456789', aad);
    const parts = ct.split('.');
    const body = Buffer.from(parts[4]!, 'base64url');
    body[0] = body[0]! ^ 0xff;
    parts[4] = body.toString('base64url');
    expect(() => enc.decrypt(parts.join('.'), aad)).toThrow();
  });

  it('decrypts values written under a previous key after rotation', () => {
    const old = enc.encrypt('0123456789', aad);
    const rotated = new FieldEncryption('k2', k(), `k1:${key1}`);
    expect(rotated.decrypt(old, aad)).toBe('0123456789');
    expect(rotated.needsRotation(old)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt('x', aad))).toBe(false);
  });

  it('rejects keys of the wrong size', () => {
    expect(() => new FieldEncryption('k1', randomBytes(16).toString('base64'))).toThrow();
  });
});
