import { generateKeyPairSync, sign } from 'crypto';
import { verifySigned } from '../lib/entitlements';

jest.mock('../lib/api', () => ({ api: jest.fn() }));
jest.mock('../lib/db', () => ({ kvGet: jest.fn(), kvSet: jest.fn() }));
jest.mock('../lib/config', () => ({ config: { entitlementPublicKey: null } }));

function makeToken(payload: object) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(null, Buffer.from(body), privateKey).toString('base64url');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { token: `${body}.${sig}`, pub: der.subarray(der.length - 32).toString('base64') };
}

describe('offline entitlement check', () => {
  const payload = { sub: 'user-1', entitlements: [{ examCode: 'WAEC', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z' }], iat: 1, exp: 2 };

  it('accepts a token signed by the server key', () => {
    const { token, pub } = makeToken(payload);
    expect(verifySigned(token, pub, 'user-1')?.entitlements[0].examCode).toBe('WAEC');
  });

  it('rejects a token for another user', () => {
    const { token, pub } = makeToken(payload);
    expect(verifySigned(token, pub, 'user-2')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const { token, pub } = makeToken(payload);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, entitlements: [{ examCode: 'JAMB', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z' }] })).toString('base64url');
    expect(verifySigned(`${forged}.${sig}`, pub, 'user-1')).toBeNull();
  });
});
