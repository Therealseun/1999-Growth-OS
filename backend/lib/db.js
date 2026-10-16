import pg from 'pg';
import { getConfig } from './config.js';


function sslOption(cfg) {
  if (cfg.DATABASE_SSL === 'off') return false;
  if (cfg.DATABASE_SSL === 'no-verify') return { rejectUnauthorized: false };
  const ca = cfg.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

export function getPool() {
  if (!globalThis.__growthosPool) {
    const cfg = getConfig();
    const pool = new pg.Pool({
      connectionString: cfg.DATABASE_URL,
      max: cfg.DATABASE_POOL_MAX,
      ssl: sslOption(cfg),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 30_000,
    });
    pool.on('error', (err) => {
      console.error(JSON.stringify({ level: 'error', message: 'idle database client error', error: err.message }));
    });
    globalThis.__growthosPool = pool;
  }
  return globalThis.__growthosPool;
}

export async function closePool() {
  if (globalThis.__growthosPool) {
    const pool = globalThis.__growthosPool;
    globalThis.__growthosPool = undefined;
    await pool.end();
  }
}

// Reads that need no transaction. Never use this for writes: a write needs withTransaction so
// the audit log can record who did it.
export function query(text, params) {
  return getPool().query(text, params);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTransaction(actorId, fn) {
  if (actorId != null && !UUID.test(actorId)) {
    throw new Error('withTransaction: actorId must be a user id (uuid) or null');
  }
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (actorId) await client.query("select set_config('app.actor', $1, true)", [actorId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
    }
    throw err;
  } finally {
    client.release();
  }
}
