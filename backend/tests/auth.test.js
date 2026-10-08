import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authenticate, setKeyResolverForTests } from '@/lib/auth';
import { ISSUER, createUser, request, resetData, shutdown, signToken } from './helpers.js';

const auth = (token, scheme = 'Bearer') =>
  request('/x', { headers: token ? { authorization: `${scheme} ${token}` } : {} });

async function failure(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a failure');
}

beforeEach(resetData);
afterEach(() => setKeyResolverForTests(undefined));
afterAll(shutdown);

describe('authenticate (shared secret mode)', () => {
  it('accepts a valid token for an active user and returns the database profile', async () => {
    const u = await createUser({ role: 'MANAGER' });
    const session = await authenticate(auth(await signToken(u.id)));
    expect(session.userId).toBe(u.id);
    expect(session.profile).toMatchObject({ id: u.id, role: 'MANAGER', status: 'ACTIVE' });
  });

  it('takes the role from the database, never from claims in the token', async () => {
    const u = await createUser({ role: 'EMPLOYEE' });
    const token = await signToken(u.id, { claims: { app_metadata: { role: 'ADMIN' }, user_role: 'ADMIN' } });
    const { profile } = await authenticate(auth(token));
    expect(profile.role).toBe('EMPLOYEE');
  });

  it('rejects a missing or malformed Authorization header with 401', async () => {
    expect(await failure(authenticate(auth()))).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    const u = await createUser();
    const t = await signToken(u.id);
    expect(await failure(authenticate(auth(t, 'Token')))).toMatchObject({ status: 401 });
    expect(await failure(authenticate(auth('')))).toMatchObject({ status: 401 });
  });

  it('rejects a bad signature, wrong audience, wrong issuer and non-uuid subject', async () => {
    const u = await createUser();
    const wrongSecret = new TextEncoder().encode('another-secret-another-secret-another');
    expect(await failure(authenticate(auth(await signToken(u.id, { secret: wrongSecret }))))).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await failure(authenticate(auth(await signToken(u.id, { audience: 'anon' }))))).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await failure(authenticate(auth(await signToken(u.id, { issuer: 'https://evil.example/auth/v1' }))))).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await failure(authenticate(auth(await signToken('not-a-uuid'))))).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('reports an expired token as TOKEN_EXPIRED so the frontend can refresh', async () => {
    const u = await createUser();
    const expired = await signToken(u.id, { expiresIn: '-1m' });
    expect(await failure(authenticate(auth(expired)))).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
  });

  it('rejects an unsigned token (alg none)', async () => {
    const u = await createUser();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: u.id, aud: 'authenticated', iss: ISSUER, exp: now + 3600 })}.`;
    expect(await failure(authenticate(auth(forged)))).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });

  it('refuses PENDING and DISABLED accounts with distinct codes', async () => {
    const pending = await createUser({ status: 'PENDING' });
    const disabled = await createUser({ status: 'DISABLED' });
    expect(await failure(authenticate(auth(await signToken(pending.id))))).toMatchObject({ status: 403, code: 'ACCOUNT_PENDING' });
    expect(await failure(authenticate(auth(await signToken(disabled.id))))).toMatchObject({ status: 403, code: 'ACCOUNT_DISABLED' });
  });

  it('refuses a valid token whose user has no profile', async () => {
    const ghost = '00000000-0000-4000-8000-000000000099';
    expect(await failure(authenticate(auth(await signToken(ghost))))).toMatchObject({ status: 403, code: 'NO_PROFILE' });
  });

  it('a user disabled after login is refused on the next request even with a live token', async () => {
    const u = await createUser();
    const t = await signToken(u.id);
    await authenticate(auth(t));
    const { query } = await import('@/lib/db');
    await query("update profiles set status = 'DISABLED' where id = $1", [u.id]);
    expect(await failure(authenticate(auth(t)))).toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
});

describe('authenticate (asymmetric signing keys, the default for new projects)', () => {
  async function asymmetric() {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    setKeyResolverForTests({ key: createLocalJWKSet({ keys: [jwk] }), algorithms: ['ES256', 'RS256', 'EdDSA'] });
    return privateKey;
  }
  const sign = (privateKey, sub, alg = 'ES256') =>
    new SignJWT({}).setProtectedHeader({ alg, kid: 'k1' }).setSubject(sub).setIssuer(ISSUER).setAudience('authenticated').setExpirationTime('1h').sign(privateKey);

  it('accepts a token signed by a key in the JWKS', async () => {
    const privateKey = await asymmetric();
    const u = await createUser();
    const session = await authenticate(auth(await sign(privateKey, u.id)));
    expect(session.userId).toBe(u.id);
  });

  it('rejects a token signed by an unknown key', async () => {
    await asymmetric();
    const other = await generateKeyPair('ES256');
    const u = await createUser();
    expect(await failure(authenticate(auth(await sign(other.privateKey, u.id))))).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('rejects an HS256 token when only asymmetric algorithms are allowed (algorithm confusion)', async () => {
    await asymmetric();
    const u = await createUser();
    const hs = await signToken(u.id);
    expect(await failure(authenticate(auth(hs)))).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });
});
