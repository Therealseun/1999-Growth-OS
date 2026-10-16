import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getConfig } from './config.js';
import { query } from './db.js';
import { forbidden, unauthorized } from './errors.js';

// Credentials for machines: the AI/Sift services (X-Integration-Key) and the scheduler (CRON_SECRET).

export const SCOPES = Object.freeze({
  DELIVER: 'integrations:deliver', // may call /api/integrations/*
});

export const hashKey = (key) => createHash('sha256').update(key).digest('hex');

// Used by the admin endpoint that creates keys. The plain key is shown once. Only the hash is stored.
export function generateIntegrationKey() {
  const key = `gos_${randomBytes(32).toString('base64url')}`;
  return { key, hash: hashKey(key) };
}

export async function authenticateIntegration(request, requiredScope) {
  const key = request.headers.get('x-integration-key');
  if (!key) throw unauthorized('Integration key required', 'INVALID_KEY');

  const { rows } = await query(
    'select id, name, scopes from integration_clients where key_hash = $1 and revoked_at is null',
    [hashKey(key)],
  );
  const client = rows[0];
  if (!client) throw unauthorized('Invalid or revoked integration key', 'INVALID_KEY');
  if (requiredScope && !client.scopes.includes(requiredScope)) {
    throw forbidden(`This key does not have the ${requiredScope} scope`, 'MISSING_SCOPE');
  }

  try {
    await query('update integration_clients set last_used_at = now() where id = $1', [client.id]);
  } catch {
    // Bookkeeping only. Never fail a delivery because of it.
  }
  return client;
}

// Compare digests so the comparison takes the same time whatever the input length.
export function authenticateCron(request) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw unauthorized('Scheduler secret required', 'INVALID_CRON_SECRET');
  const given = createHash('sha256').update(match[1]).digest();
  const expected = createHash('sha256').update(getConfig().CRON_SECRET).digest();
  if (!timingSafeEqual(given, expected)) throw unauthorized('Invalid scheduler secret', 'INVALID_CRON_SECRET');
}
