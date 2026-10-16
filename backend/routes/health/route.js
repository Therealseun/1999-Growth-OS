import { query } from '../../lib/db.js';
import { json, route } from '../../lib/http.js';

// Public. Tells the deploy platform and the team whether the API can reach a migrated database.
export const GET = route({ auth: 'none' }, async () => {
  try {
    const { rows } = await query("select value #>> '{}' as timezone from app_settings where key = 'timezone'");
    const migrated = rows.length === 1;
    return json(
      { ok: migrated, database: true, schema: migrated, timezone: rows[0]?.timezone ?? null, time: new Date().toISOString() },
      migrated ? 200 : 503,
    );
  } catch {
    return json({ ok: false, database: false, schema: false, time: new Date().toISOString() }, 503);
  }
});
