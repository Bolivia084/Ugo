import { base32Decode, base32Encode, decryptField, encryptField, totp, verifyTotp } from './crypto.js';
import { scrub } from './audit.service.js';

describe('crypto helpers', () => {
  it('base32 round trips', () => {
    const buf = Buffer.from('12345678901234567890');
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(buf)).toBe(true);
  });

  it('matches the RFC 6238 SHA-1 test vector (last 6 digits)', () => {
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082');
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000 + 30_000)).toBe(true);
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000 + 120_000)).toBe(false);
  });

  it('encrypts fields with AES-256-GCM', () => {
    const key = Buffer.alloc(32, 1).toString('base64');
    const blob = encryptField('secret', key);
    expect(blob).not.toContain('secret');
    expect(decryptField(blob, key)).toBe('secret');
    expect(() => decryptField(blob, Buffer.alloc(32, 2).toString('base64'))).toThrow();
  });

  it('never writes secrets to the audit log', () => {
    expect(scrub({ email: 'a@b.c', password: 'x', nested: { refreshToken: 'y', ok: 1 } })).toEqual({ email: 'a@b.c', password: '[redacted]', nested: { refreshToken: '[redacted]', ok: 1 } });
  });
});
