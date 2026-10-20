// Jobs record every request GrowthOS makes to the AI and Sift services.
export const OPEN_STATUSES = ['REQUESTED', 'ACCEPTED', 'RUNNING'];
export const MAX_FAILED_ATTEMPTS = 3;

export async function findOpenJob(db, campaignId, kind) {
  const { rows } = await db.query(
    `select * from integration_jobs where campaign_id = $1 and kind = $2 and status = any($3) limit 1`,
    [campaignId, kind, OPEN_STATUSES],
  );
  return rows[0] ?? null;
}

export async function insertJob(db, { campaignId, kind, count, summary }) {
  const { rows } = await db.query(
    `insert into integration_jobs (campaign_id, kind, requested_count, request_payload)
     values ($1, $2, $3, $4) returning *`,
    [campaignId, kind, count ?? null, summary ? JSON.stringify(summary) : null],
  );
  return rows[0];
}

// Units requested but not yet delivered by jobs still open. Prevents asking for the same work twice.
export async function inFlight(db, campaignId, kind) {
  const { rows } = await db.query(
    `select coalesce(sum(greatest(requested_count - delivered_count, 0)), 0)::int as n
     from integration_jobs where campaign_id = $1 and kind = $2 and status = any($3)`,
    [campaignId, kind, OPEN_STATUSES],
  );
  return rows[0].n;
}

// After MAX_FAILED_ATTEMPTS failures in 24 hours with no success in between, stop asking until the
// window passes. A person can still trigger a manual request.
export async function tooManyFailures(db, campaignId, kind) {
  const { rows } = await db.query(
    `select count(*)::int as n from integration_jobs f
     where f.campaign_id = $1 and f.kind = $2 and f.status = 'FAILED'
       and f.requested_at > now() - interval '24 hours'
       and not exists (select 1 from integration_jobs s
                       where s.campaign_id = f.campaign_id and s.kind = f.kind
                         and s.status = 'COMPLETED' and s.requested_at > f.requested_at)`,
    [campaignId, kind],
  );
  return rows[0].n >= MAX_FAILED_ATTEMPTS;
}

export async function failStuckJobs(db, minutes) {
  const { rows } = await db.query(
    `update integration_jobs
        set status = 'FAILED', completed_at = now(),
            error = 'Timed out: no result within ' || $2::int || ' minutes'
      where status = any($1) and requested_at < now() - make_interval(mins => $2::int)
      returning id`,
    [OPEN_STATUSES, minutes],
  );
  return rows.length;
}
