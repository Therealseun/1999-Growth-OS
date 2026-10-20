// Dates in this app are Africa/Lagos calendar days (the timezone is a database setting). Always ask the
// database for "today". The server's own clock and timezone are never used for business dates.
//
// db is anything with .query(): the pool helper { query } or a transaction client.

export async function appToday(db) {
  const { rows } = await db.query('select app_today()::text as d');
  return rows[0].d;
}

export async function addDays(db, date, days) {
  const { rows } = await db.query('select ($1::date + $2::int)::text as d', [date, days]);
  return rows[0].d;
}

export async function requiresNicheApproval(db) {
  const { rows } = await db.query("select value #>> '{}' as v from app_settings where key = 'require_niche_approval'");
  return rows[0]?.v !== 'false';
}
