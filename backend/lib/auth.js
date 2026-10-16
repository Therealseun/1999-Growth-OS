import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getConfig } from './config.js';
import { query } from './db.js';
import { forbidden, unauthorized } from './errors.js';

// Token verification for browser users. Supabase Auth issues the token. The database decides the
// role, department and whether the account is active, so a token alone never grants access.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let keyOverride; // tests only

export function setKeyResolverForTests(resolver) {
  keyOverride = resolver;
}

function resolveKey() {
  if (keyOverride) return keyOverride;
  const cfg = getConfig();
  if (cfg.SUPABASE_JWT_SECRET) {
    return { key: new TextEncoder().encode(cfg.SUPABASE_JWT_SECRET), algorithms: ['HS256'] };
  }
  if (!globalThis.__growthosJwks) {
    const url = new URL('/auth/v1/.well-known/jwks.json', cfg.SUPABASE_URL);
    globalThis.__growthosJwks = createRemoteJWKSet(url, { cooldownDuration: 30_000 });
  }
  return { key: globalThis.__growthosJwks, algorithms: ['ES256', 'RS256', 'EdDSA'] };
}

export async function verifyAccessToken(token) {
  const cfg = getConfig();
  const { key, algorithms } = resolveKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms,
      issuer: new URL('/auth/v1', cfg.SUPABASE_URL).toString().replace(/\/$/, ''),
      audience: cfg.SUPABASE_JWT_AUDIENCE,
      clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
      throw unauthorized('Invalid token', 'INVALID_TOKEN');
    }
    return payload;
  } catch (err) {
    if (err?.status === 401) throw err;
    if (err?.code === 'ERR_JWT_EXPIRED') throw unauthorized('Token expired', 'TOKEN_EXPIRED');
    throw unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}

export function getBearerToken(request) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

export async function loadProfile(userId) {
  const { rows } = await query(
    getConfig().GROWTHOS_SCHEMA === 'shared'
      ? "select id, full_name as name, email, role, case when active then 'ACTIVE' else 'DISABLED' end as status, created_at, updated_at from public.profiles where id = $1"
      : 'select id, name, email, role, status, department_id, created_at, updated_at from profiles where id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

// PENDING and DISABLED accounts are refused everywhere. The codes let the frontend show the right screen.
export function assertActive(profile) {
  if (profile.status === 'PENDING') {
    throw forbidden('Your account is waiting for Admin approval', 'ACCOUNT_PENDING');
  }
  if (profile.status === 'DISABLED') {
    throw forbidden('Your account has been disabled', 'ACCOUNT_DISABLED');
  }
}

// Returns { userId, profile } or throws 401 / 403.
export async function authenticate(request) {
  const token = getBearerToken(request);
  if (!token) throw unauthorized();
  const claims = await verifyAccessToken(token);
  const profile = await loadProfile(claims.sub);
  if (!profile) throw forbidden('No profile exists for this account', 'NO_PROFILE');
  assertActive(profile);
  return { userId: profile.id, profile };
}
