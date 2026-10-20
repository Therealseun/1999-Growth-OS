import { json, route } from '../../../lib/http.js';
import { query } from '../../db.js';

export const GET = route({ auth: 'none' }, async () => {
  const { rows: [status] } = await query(
    "select to_regclass('growthos_ai.version') is not null as installed",
  );
  return json(
    { ok: status.installed, database: true, schema: status.installed, mode: 'shared', service: 'growthos-ai' },
    status.installed ? 200 : 503,
  );
});
