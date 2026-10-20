import { invalid } from './errors.js';
import { UUID_RE } from './validators.js';

// Keyset pagination. The cursor holds the last row's created_at and id, so pages stay stable while rows
// are added. The timestamp is read from SQL as text because a JS Date would cut off microseconds.
//
// Usage: select the column  TS('t.created_at') as _ts , order by created_at, id, fetch limit + 1 rows,
// then pass the rows to finishPage().

export const TS = (column) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeCursor(ts, id) {
  return Buffer.from(JSON.stringify([ts, id])).toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    const [ts, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof ts === 'string' && TS_RE.test(ts) && typeof id === 'string' && UUID_RE.test(id)) return { ts, id };
  } catch {
    // falls through
  }
  throw invalid('Invalid cursor', undefined, 'INVALID_CURSOR');
}

export function finishPage(rows, limit) {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const next_cursor = rows.length > limit && last ? encodeCursor(last._ts, last.id) : null;
  for (const row of items) delete row._ts;
  return { items, next_cursor };
}

// Cursor for tables keyed by a number (the audit log).
export function decodeNumberCursor(cursor) {
  const n = Number(cursor);
  if (!Number.isSafeInteger(n) || n < 1) throw invalid('Invalid cursor', undefined, 'INVALID_CURSOR');
  return n;
}
