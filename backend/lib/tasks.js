import { z } from 'zod';
import { query, withTransaction } from './db.js';
import { conflict, forbidden, notFound } from './errors.js';
import { decodeCursor, finishPage, TS } from './pagination.js';
import { assertEmployeeVisible, taskScope } from './scope.js';
import { assertFileExists, assertOwnPath } from './storage.js';
import { evidenceInput, httpUrl, pageQuery, uuid } from './validators.js';
import { assignNow } from './pipeline.js';

// The three workstreams share one set of rules. Each kind below describes its table and fields.
//
//   open task      READY or REVIEWED. The owner may edit it, review it, skip it, or complete it.
//   completed      SENT, PUBLISHED or POSTED. Locked. The database trigger enforces it too.
//   closed         SKIPPED, INVALID or EXPIRED. Final. The engine replaces skipped and invalid tasks.
//
// Only the assigned employee changes a task. Managers and Admins read, so a completion is always
// attributable to the person who did the work.

const PROSPECT_JSON = `jsonb_build_object('id', p.id, 'campaign_id', p.campaign_id, 'sift_id', p.sift_id,
  'organisation', p.organisation, 'contact_name', p.contact_name, 'email', p.email, 'website', p.website,
  'industry', p.industry, 'location', p.location, 'qualification_status', p.qualification_status,
  'qualification_reason', p.qualification_reason)`;

export const KINDS = {
  email: {
    table: 'email_tasks',
    ws: 'EMAIL',
    fk: 'email_task_id',
    done: 'SENT',
    doneAt: 'sent_at',
    editable: ['subject', 'body'],
    base: `select t.id, t.campaign_id, t.employee_id, t.subject, t.body, t.status, t.skip_reason, t.created_at,
                  t.assigned_at, t.reviewed_at, t.sent_at, ${PROSPECT_JSON} as prospect, ${TS('t.created_at')} as _ts
             from email_tasks t join prospects p on p.id = t.prospect_id`,
    view: (r) => ({ ...r, locked: r.status === 'SENT' }),
  },
  seo: {
    table: 'seo_tasks',
    ws: 'SEO',
    fk: 'seo_task_id',
    done: 'PUBLISHED',
    doneAt: 'published_at',
    editable: ['title', 'article', 'meta_title', 'meta_description', 'cta', 'platform'],
    base: `select t.id, t.campaign_id, t.employee_id, t.topic, t.primary_keyword, t.secondary_keywords,
                  t.search_intent, t.target_audience, t.title, t.article, t.meta_title, t.meta_description, t.cta,
                  t.platform, t.status, t.skip_reason, t.published_url, t.created_at, t.assigned_at, t.reviewed_at,
                  t.published_at, ${TS('t.created_at')} as _ts
             from seo_tasks t`,
    view: (r) => ({ ...r, locked: r.status === 'PUBLISHED' }),
  },
  lead: {
    table: 'lead_magnet_tasks',
    ws: 'LEAD_MAGNET',
    fk: 'lead_task_id',
    done: 'POSTED',
    doneAt: 'posted_at',
    editable: ['comment'],
    base: `select t.id, t.campaign_id, t.employee_id, t.platform, t.author, t.post_url, t.post_text,
                  t.relevance_reason, t.comment, t.status, t.skip_reason, t.evidence_url, t.created_at,
                  t.assigned_at, t.reviewed_at, t.posted_at, ${TS('t.created_at')} as _ts
             from lead_magnet_tasks t`,
    view: (r) => ({ ...r, locked: r.status === 'POSTED' }),
  },
};

const STATUSES = {
  email: ['READY', 'REVIEWED', 'SENT', 'SKIPPED', 'INVALID', 'EXPIRED'],
  seo: ['READY', 'REVIEWED', 'PUBLISHED', 'SKIPPED', 'INVALID', 'EXPIRED'],
  lead: ['READY', 'REVIEWED', 'POSTED', 'SKIPPED', 'INVALID', 'EXPIRED'],
};

export const listQuery = (kind) =>
  z.object({
    status: z.enum(STATUSES[kind]).optional(),
    employee_id: uuid.optional(),
    ...pageQuery,
  });

const strip = (row) => {
  delete row._ts;
  return row;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listTasks(kind, session, q) {
  const k = KINDS[kind];
  const { profile } = session;
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  // Tasks still in the pool belong to nobody yet, so lists show assigned work only.
  const where = ['t.employee_id is not null', taskScope(profile, 't', add)];
  if (q.status) where.push(`t.status = ${add(q.status)}`);
  if (q.employee_id) {
    await assertEmployeeVisible(profile, q.employee_id);
    where.push(`t.employee_id = ${add(q.employee_id)}::uuid`);
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    where.push(`(t.created_at, t.id) > (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`);
  }
  const { rows } = await query(
    `${k.base} where ${where.join(' and ')} order by t.created_at, t.id limit ${add(q.limit + 1)}`,
    params,
  );
  const page = finishPage(rows, q.limit);
  return { items: page.items.map(k.view), next_cursor: page.next_cursor };
}

export async function getTask(kind, session, id) {
  const k = KINDS[kind];
  const params = [id];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const scope = taskScope(session.profile, 't', add);
  const { rows } = await query(`${k.base} where t.id = $1 and ${scope}`, params);
  if (!rows[0]) throw notFound();
  return k.view(strip(rows[0]));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
// Finds the task, locks the row for the rest of the transaction, and enforces who may change it and when.
async function lockOpenTask(db, k, session, id) {
  const params = [id];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const scope = taskScope(session.profile, 't', add);
  const { rows } = await db.query(`select t.* from ${k.table} t where t.id = $1 and ${scope} for update of t`, params);
  const row = rows[0];
  if (!row) throw notFound();
  if (row.employee_id !== session.userId) {
    throw forbidden('Only the assigned employee can change this task', 'NOT_TASK_OWNER');
  }
  if (row.status === k.done) throw conflict('This task is completed and locked', 'TASK_LOCKED');
  if (['SKIPPED', 'INVALID', 'EXPIRED'].includes(row.status)) {
    throw conflict(`This task is ${row.status} and can no longer change`, 'TASK_CLOSED');
  }
  return row;
}

async function fetchOne(db, k, id) {
  const { rows } = await db.query(`${k.base} where t.id = $1`, [id]);
  return k.view(strip(rows[0]));
}

async function insertEvidence(db, k, taskId, userId, ev) {
  await db.query(
    `insert into execution_evidence (workstream, ${k.fk}, employee_id, evidence_type, evidence_value, storage_path)
     values ($1, $2, $3, $4, $5, $6)`,
    [k.ws, taskId, userId, ev.type, ev.type === 'FILE' ? null : ev.value, ev.type === 'FILE' ? ev.storage_path : null],
  );
}

// Files are checked before the transaction starts, so no storage call happens while a row is locked.
async function checkEvidenceFile(userId, ev) {
  if (ev?.type !== 'FILE') return;
  assertOwnPath(userId, ev.storage_path);
  await assertFileExists(ev.storage_path);
}

const reason = z.string().trim().min(1).max(1000);

export function patchBody(kind) {
  const fields = {
    email: { subject: z.string().trim().min(1).max(300), body: z.string().min(1).max(50_000) },
    seo: {
      title: z.string().trim().min(1).max(500),
      article: z.string().min(1).max(200_000),
      meta_title: z.string().trim().max(70),
      meta_description: z.string().trim().max(170),
      cta: z.string().trim().max(1000),
      platform: z.string().trim().max(100),
    },
    lead: { comment: z.string().trim().min(1).max(5000) },
  }[kind];

  return z
    .object({
      ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
      status: z.enum(['REVIEWED', 'SKIPPED', 'INVALID']).optional(),
      skip_reason: reason.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Send at least one field to change')
    .refine((b) => b.status !== 'SKIPPED' || b.skip_reason, { message: 'A skip needs a reason', path: ['skip_reason'] })
    .refine((b) => !b.skip_reason || b.status === 'SKIPPED' || b.status === 'INVALID', {
      message: 'A reason only goes with SKIPPED or INVALID',
      path: ['skip_reason'],
    });
}

export async function patchTask(kind, session, id, input) {
  const k = KINDS[kind];
  const result = await withTransaction(session.userId, async (db) => {
    await lockOpenTask(db, k, session, id);
    const sets = [];
    const params = [id];
    const add = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    for (const column of k.editable) {
      if (input[column] !== undefined) sets.push(`${column} = ${add(input[column])}`);
    }
    if (input.status === 'REVIEWED') sets.push('status = \'REVIEWED\'', 'reviewed_at = coalesce(reviewed_at, now())');
    if (input.status === 'SKIPPED' || input.status === 'INVALID') {
      sets.push(`status = ${add(input.status)}`, `skip_reason = ${add(input.skip_reason ?? null)}`);
    }
    if (sets.length > 0) await db.query(`update ${k.table} set ${sets.join(', ')} where id = $1`, params);
    return fetchOne(db, k, id);
  });
  // A skipped or invalid task is replaced from the pool straight away, if the pool has one.
  if (input.status === 'SKIPPED' || input.status === 'INVALID') await assignNow();
  return result;
}

export const markSentBody = z.object({ evidence: evidenceInput.optional() }).strict();
export const publishBody = z
  .object({ published_url: httpUrl, platform: z.string().trim().max(100).optional(), evidence: evidenceInput.optional() })
  .strict();
export const markPostedBody = z
  .object({ comment: z.string().trim().min(1).max(5000).optional(), evidence_url: httpUrl.optional(), evidence: evidenceInput })
  .strict();

export async function completeTask(kind, session, id, input) {
  const k = KINDS[kind];
  await checkEvidenceFile(session.userId, input.evidence);

  return withTransaction(session.userId, async (db) => {
    await lockOpenTask(db, k, session, id);

    if (kind === 'email') {
      await db.query(
        `update email_tasks set status = 'SENT', sent_at = now(), reviewed_at = coalesce(reviewed_at, now()) where id = $1`,
        [id],
      );
    } else if (kind === 'seo') {
      await db.query(
        `update seo_tasks set status = 'PUBLISHED', published_at = now(), published_url = $2,
                platform = coalesce($3, platform), reviewed_at = coalesce(reviewed_at, now()) where id = $1`,
        [id, input.published_url, input.platform ?? null],
      );
    } else {
      const evidenceUrl = input.evidence_url ?? (input.evidence.type === 'URL' ? input.evidence.value : null);
      await db.query(
        `update lead_magnet_tasks set status = 'POSTED', posted_at = now(), comment = coalesce($2, comment),
                evidence_url = $3, reviewed_at = coalesce(reviewed_at, now()) where id = $1`,
        [id, input.comment ?? null, evidenceUrl],
      );
    }
    if (input.evidence) await insertEvidence(db, k, id, session.userId, input.evidence);
    return fetchOne(db, k, id);
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function todaySummary(employeeId, today) {
  const { rows } = await query(
    `select r.campaign_id,
            r.email_target_snapshot as et, r.seo_target_snapshot as st, r.lead_magnet_target_snapshot as lt,
            r.carried_in_email as ce, r.carried_in_seo as cs, r.carried_in_lead_magnet as cl,
            r.email_completed::int as ec, r.seo_completed::int as sc, r.lead_magnet_completed::int as lc
       from v_daily_report r where r.employee_id = $1 and r.work_date = $2::date`,
    [employeeId, today],
  );
  const campaignIds = rows.map((r) => r.campaign_id);
  const open = await query(
    `select ws, count(*)::int as n from v_task_ledger
      where employee_id = $1 and status_class = 'OPEN' and campaign_id = any($2::uuid[]) group by ws`,
    [employeeId, campaignIds],
  );
  const openBy = Object.fromEntries(open.rows.map((r) => [r.ws, r.n]));
  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);

  const workstreams = [
    { workstream: 'EMAIL', required: sum('et'), completed: sum('ec'), carried_in: sum('ce') },
    { workstream: 'SEO', required: sum('st'), completed: sum('sc'), carried_in: sum('cs') },
    { workstream: 'LEAD_MAGNET', required: sum('lt'), completed: sum('lc'), carried_in: sum('cl') },
  ].map((w) => ({
    workstream: w.workstream,
    required: w.required,
    // prepared = open tasks held + tasks completed today, the same rule the engine uses to top up
    prepared: (openBy[w.workstream] ?? 0) + w.completed,
    completed: w.completed,
    carried_in: w.carried_in,
  }));

  // Completion is capped per workstream, so extra emails cannot cover missing articles. The cap is applied per
  // workload, because one employee may hold more than one.
  const capped = rows.reduce((n, r) => n + Math.min(r.ec, r.et) + Math.min(r.sc, r.st) + Math.min(r.lc, r.lt), 0);
  const totalRequired = workstreams.reduce((n, w) => n + w.required, 0);
  return {
    date: today,
    campaign_id: rows.length === 1 ? rows[0].campaign_id : null,
    workstreams,
    total_required: totalRequired,
    total_completed: workstreams.reduce((n, w) => n + w.completed, 0),
    completion_pct: totalRequired === 0 ? 0 : Math.round((1000 * capped) / totalRequired) / 10,
  };
}
