import { getConfig } from './config.js';
import { appToday } from './appdate.js';
import { withTransaction } from './db.js';
import { failStuckJobs, inFlight, tooManyFailures } from './jobs.js';
import { dispatchJob } from './provider.js';
import {
  availableProspects,
  createRequest,
  MAX_EMAIL_PROSPECTS,
  MAX_SEARCH_COUNT,
  usableNicheProfile,
} from './requests.js';

// The task engine in JavaScript. The assignment rules live in SQL (assign_pool_tasks and friends). This file
// decides what to ask the AI and Sift services for, so work arrives before it is needed.
//
//   generateWorkloads()  nightly: expire, snapshot targets, assign from the pool, request the shortfall
//   topUp()              hourly and after deliveries: assign, request what is still missing
//
// Both take a database lock first, so two runs at once cannot request the same work twice. Job rows are
// written inside the transaction. The calls to the provider happen after it commits.

const LOCK = "select pg_advisory_xact_lock(hashtext('growthos-pipeline'))";

function sumShortfalls(rows) {
  const byCampaign = new Map();
  for (const r of rows) {
    if (!byCampaign.has(r.campaign_id)) byCampaign.set(r.campaign_id, { EMAIL: 0, SEO: 0, LEAD_MAGNET: 0 });
    byCampaign.get(r.campaign_id)[r.ws] += r.shortfall;
  }
  return byCampaign;
}

// Decides which jobs to create for every campaign that is short. Runs inside the lock transaction.
async function planRequests(db, shortfalls) {
  const requests = [];
  const skipped = [];
  const ids = [...shortfalls.keys()].filter((id) => {
    const s = shortfalls.get(id);
    return s.EMAIL + s.SEO + s.LEAD_MAGNET > 0;
  });
  if (ids.length === 0) return { requests, skipped };

  const { rows: campaigns } = await db.query(
    "select * from campaigns where id = any($1::uuid[]) and status = 'ACTIVE' order by created_at",
    [ids],
  );

  for (const campaign of campaigns) {
    const need = shortfalls.get(campaign.id);
    const niche = await usableNicheProfile(db, campaign.id);
    if (!niche) {
      skipped.push({ campaign_id: campaign.id, reason: 'NO_APPROVED_NICHE_PROFILE' });
      continue;
    }

    const add = async (kind, options, what) => {
      if (await tooManyFailures(db, campaign.id, kind)) {
        skipped.push({ campaign_id: campaign.id, kind, reason: 'TOO_MANY_FAILURES' });
        return;
      }
      requests.push({ what, ...(await createRequest(db, { campaign, kind, niche, ...options })) });
    };

    // Emails need prospects first. Use what is already held, and search only for the gap.
    const emailNeed = need.EMAIL - (await inFlight(db, campaign.id, 'EMAIL_GENERATION'));
    if (emailNeed > 0) {
      const ready = await availableProspects(db, campaign.id, emailNeed);
      if (ready.length > 0) {
        await add('EMAIL_GENERATION', { prospects: ready.slice(0, MAX_EMAIL_PROSPECTS) }, 'emails');
      }
      const gap = emailNeed - ready.length - (await inFlight(db, campaign.id, 'PROSPECT_SEARCH'));
      if (gap > 0) await add('PROSPECT_SEARCH', { count: Math.min(gap, MAX_SEARCH_COUNT) }, 'prospects');
    }

    const seoNeed = need.SEO - (await inFlight(db, campaign.id, 'SEO_GENERATION'));
    if (seoNeed > 0) await add('SEO_GENERATION', { count: seoNeed }, 'articles');

    const leadNeed = need.LEAD_MAGNET - (await inFlight(db, campaign.id, 'LEAD_MAGNET_GENERATION'));
    if (leadNeed > 0) await add('LEAD_MAGNET_GENERATION', { count: leadNeed }, 'lead magnets');
  }
  return { requests, skipped };
}

async function dispatchAll(requests) {
  const settled = await Promise.allSettled(requests.map((r) => dispatchJob(r.job, r.payload)));
  return settled.map((result, i) => {
    const { job } = requests[i];
    if (result.status === 'fulfilled') {
      const j = result.value;
      return { id: j.id, campaign_id: j.campaign_id, kind: j.kind, count: job.requested_count, status: j.status, error: j.error ?? undefined };
    }
    return { id: job.id, campaign_id: job.campaign_id, kind: job.kind, count: job.requested_count, status: 'FAILED', error: result.reason?.message };
  });
}

function summary(today, extra, assignRows, plan, jobs) {
  const stillShort = { EMAIL: 0, SEO: 0, LEAD_MAGNET: 0 };
  for (const r of assignRows) stillShort[r.ws] += r.shortfall;
  return {
    today,
    ...extra,
    assigned: assignRows.reduce((n, r) => n + r.assigned, 0),
    still_short: stillShort,
    jobs,
    skipped: plan.skipped,
  };
}

export async function generateWorkloads() {
  const { today, extra, assignRows, plan } = await withTransaction(null, async (db) => {
    await db.query(LOCK);
    const today = await appToday(db);
    const expired = (await db.query('select expire_stale_tasks() as n')).rows[0].n;
    const created = (await db.query('select create_daily_workloads($1::date) as n', [today])).rows[0].n;
    const stuck = await failStuckJobs(db, getConfig().JOB_TIMEOUT_MINUTES);
    const { rows: assignRows } = await db.query('select * from assign_pool_tasks($1::date)', [today]);
    const plan = await planRequests(db, sumShortfalls(assignRows));
    return { today, extra: { expired, workloads_created: created, stuck_jobs_failed: stuck }, assignRows, plan };
  });
  return summary(today, extra, assignRows, plan, await dispatchAll(plan.requests));
}

export async function topUp() {
  const { today, extra, assignRows, plan } = await withTransaction(null, async (db) => {
    await db.query(LOCK);
    const today = await appToday(db);
    const stuck = await failStuckJobs(db, getConfig().JOB_TIMEOUT_MINUTES);
    const { rows: assignRows } = await db.query('select * from assign_pool_tasks($1::date)', [today]);
    const plan = await planRequests(db, sumShortfalls(assignRows));
    return { today, extra: { stuck_jobs_failed: stuck }, assignRows, plan };
  });
  return summary(today, extra, assignRows, plan, await dispatchAll(plan.requests));
}

// Gives newly available pool tasks to anyone who is short. Used after a delivery or a skip so people see
// replacements at once instead of waiting for the next hourly run. A failure here never fails the caller.
export async function assignNow() {
  try {
    return await withTransaction(null, async (db) => {
      const today = await appToday(db);
      const { rows } = await db.query('select * from assign_pool_tasks($1::date)', [today]);
      return rows.reduce((n, r) => n + r.assigned, 0);
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', message: 'assignNow failed', error: err.message }));
    return 0;
  }
}
