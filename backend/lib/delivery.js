import { z } from 'zod';
import { conflict, mapDbError, notFound } from './errors.js';
import { optionalText } from './validators.js';

// Results coming back from the AI and Sift services. Used by the /api/integrations routes and by the
// mock provider, so both go through exactly the same checks.
//
// A batch never fails as a whole because of one bad item. Each item is checked on its own and answered
// CREATED, DUPLICATE or REJECTED. Redelivering a batch is safe: unique references turn repeats into DUPLICATE.

export const MAX_BATCH = 100;

class ItemRejected extends Error {}

function summarise(error) {
  return error.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`).join('; ').slice(0, 300);
}

async function loadJob(db, { jobId, campaignId, kind }) {
  const { rows } = await db.query(
    'select * from integration_jobs where id = $1 and campaign_id = $2 and kind = $3 for update',
    [jobId, campaignId, kind],
  );
  const job = rows[0];
  if (!job) throw notFound('No such job for this campaign');
  if (job.status === 'CANCELLED') throw conflict('This job was cancelled', 'JOB_CLOSED');
  return job;
}

async function recordDelivery(db, jobId, created) {
  await db.query(
    `update integration_jobs
        set delivered_count = delivered_count + $2,
            status = case when status in ('REQUESTED', 'ACCEPTED') then 'RUNNING'::job_status else status end,
            accepted_at = coalesce(accepted_at, now())
      where id = $1`,
    [jobId, created],
  );
}

// Runs insertItem for every valid item inside its own savepoint, so a failing item rolls back alone.
async function processItems(db, items, { schema, refOf, findExisting, insertItem, terminal }) {
  const results = [];
  for (const raw of items) {
    const ref = refOf(raw);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      results.push({ external_ref: ref, result: 'REJECTED', id: null, error: summarise(parsed.error) });
      continue;
    }
    if (terminal) {
      const existing = await findExisting(parsed.data);
      if (!existing) throw conflict('This job is already closed', 'JOB_CLOSED');
      results.push({ external_ref: ref, result: 'DUPLICATE', id: existing.id, error: null });
      continue;
    }
    await db.query('savepoint item');
    try {
      const out = await insertItem(parsed.data);
      await db.query('release savepoint item');
      results.push({ external_ref: ref, result: out.result, id: out.id ?? null, error: null });
    } catch (err) {
      await db.query('rollback to savepoint item');
      const message = err instanceof ItemRejected ? err.message : mapDbError(err)?.message;
      if (!message) throw err;
      results.push({ external_ref: ref, result: 'REJECTED', id: null, error: message });
    }
  }
  return results;
}

function tally(results) {
  const count = (name) => results.filter((r) => r.result === name).length;
  return { accepted: count('CREATED'), duplicates: count('DUPLICATE'), rejected: count('REJECTED'), results };
}

const stringRef = (key) => (raw) => (typeof raw?.[key] === 'string' ? raw[key].slice(0, 200) : null);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || z.string().email().safeParse(v).success, 'Not a valid email address');

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------
const prospectItem = z.object({
  sift_id: z.string().trim().min(1).max(200),
  organisation: z.string().trim().min(1).max(300),
  contact_name: optionalText(200),
  email,
  website: optionalText(500),
  industry: optionalText(200),
  location: optionalText(200),
  qualification_status: z.enum(['QUALIFIED', 'REJECTED', 'NEEDS_REVIEW']).default('NEEDS_REVIEW'),
  qualification_reason: optionalText(1000),
});

export async function deliverProspects(db, { jobId, campaignId, items }) {
  const job = await loadJob(db, { jobId, campaignId, kind: 'PROSPECT_SEARCH' });
  const findExisting = async (p) => {
    const { rows } = await db.query(
      'select id from prospects where campaign_id = $1 and (sift_id = $2 or lower(email) = $3) limit 1',
      [campaignId, p.sift_id, p.email],
    );
    return rows[0];
  };
  const results = await processItems(db, items, {
    schema: prospectItem,
    refOf: stringRef('sift_id'),
    terminal: job.status === 'COMPLETED' || job.status === 'FAILED',
    findExisting,
    insertItem: async (p) => {
      const inserted = await db.query(
        `insert into prospects (campaign_id, sift_id, organisation, contact_name, email, website, industry,
                                location, qualification_status, qualification_reason, raw)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict do nothing returning id`,
        [campaignId, p.sift_id, p.organisation, p.contact_name, p.email, p.website, p.industry, p.location,
         p.qualification_status, p.qualification_reason, JSON.stringify(p)],
      );
      if (inserted.rows[0]) return { result: 'CREATED', id: inserted.rows[0].id };
      return { result: 'DUPLICATE', id: (await findExisting(p))?.id };
    },
  });
  const out = tally(results);
  await recordDelivery(db, jobId, out.accepted);
  return out;
}

// ---------------------------------------------------------------------------
// Email tasks
// ---------------------------------------------------------------------------
const emailItem = z.object({
  external_ref: z.string().trim().min(1).max(200),
  prospect_id: z.string().uuid(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(50_000),
});

export async function deliverEmailTasks(db, { jobId, campaignId, items }) {
  const job = await loadJob(db, { jobId, campaignId, kind: 'EMAIL_GENERATION' });
  const findExisting = async (e) => {
    const { rows } = await db.query(
      'select id from email_tasks where campaign_id = $1 and (external_ref = $2 or prospect_id = $3) limit 1',
      [campaignId, e.external_ref, e.prospect_id],
    );
    return rows[0];
  };
  const results = await processItems(db, items, {
    schema: emailItem,
    refOf: stringRef('external_ref'),
    terminal: job.status === 'COMPLETED' || job.status === 'FAILED',
    findExisting,
    insertItem: async (e) => {
      const { rows } = await db.query(
        'select id, qualification_status from prospects where id = $1 and campaign_id = $2',
        [e.prospect_id, campaignId],
      );
      if (!rows[0]) throw new ItemRejected('prospect_id does not belong to this campaign');
      if (rows[0].qualification_status !== 'QUALIFIED') throw new ItemRejected('The prospect is not QUALIFIED');

      const inserted = await db.query(
        `insert into email_tasks (campaign_id, prospect_id, job_id, external_ref, subject, body)
         values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning id`,
        [campaignId, e.prospect_id, jobId, e.external_ref, e.subject, e.body],
      );
      if (inserted.rows[0]) return { result: 'CREATED', id: inserted.rows[0].id };
      return { result: 'DUPLICATE', id: (await findExisting(e))?.id };
    },
  });
  const out = tally(results);
  await recordDelivery(db, jobId, out.accepted);
  return out;
}

// ---------------------------------------------------------------------------
// SEO tasks
// ---------------------------------------------------------------------------
const seoItem = z.object({
  external_ref: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(500),
  primary_keyword: z.string().trim().min(1).max(200),
  secondary_keywords: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  search_intent: optionalText(200),
  target_audience: optionalText(500),
  title: z.string().trim().min(1).max(500),
  article: z.string().min(1).max(200_000),
  meta_title: z.string().trim().max(70).nullish().transform((v) => v || null),
  meta_description: z.string().trim().max(170).nullish().transform((v) => v || null),
  cta: optionalText(1000),
  platform: optionalText(100),
});

export async function deliverSeoTasks(db, { jobId, campaignId, items }) {
  const job = await loadJob(db, { jobId, campaignId, kind: 'SEO_GENERATION' });
  const findExisting = async (s) => {
    const { rows } = await db.query(
      'select id from seo_tasks where campaign_id = $1 and external_ref = $2',
      [campaignId, s.external_ref],
    );
    return rows[0];
  };
  const results = await processItems(db, items, {
    schema: seoItem,
    refOf: stringRef('external_ref'),
    terminal: job.status === 'COMPLETED' || job.status === 'FAILED',
    findExisting,
    insertItem: async (s) => {
      const inserted = await db.query(
        `insert into seo_tasks (campaign_id, job_id, external_ref, topic, primary_keyword, secondary_keywords,
                                search_intent, target_audience, title, article, meta_title, meta_description,
                                cta, platform)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict do nothing returning id`,
        [campaignId, jobId, s.external_ref, s.topic, s.primary_keyword, s.secondary_keywords, s.search_intent,
         s.target_audience, s.title, s.article, s.meta_title, s.meta_description, s.cta, s.platform],
      );
      if (inserted.rows[0]) return { result: 'CREATED', id: inserted.rows[0].id };
      return { result: 'DUPLICATE', id: (await findExisting(s))?.id };
    },
  });
  const out = tally(results);
  await recordDelivery(db, jobId, out.accepted);
  return out;
}

// ---------------------------------------------------------------------------
// Lead magnet tasks
// ---------------------------------------------------------------------------
const leadItem = z.object({
  external_ref: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(100),
  author: optionalText(200),
  post_url: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Only http and https links are allowed'),
  post_text: z.string().max(20_000).nullish().transform((v) => v || null),
  relevance_reason: optionalText(2000),
  comment: z.string().trim().min(1).max(5000),
});

export async function deliverLeadMagnetTasks(db, { jobId, campaignId, items }) {
  const job = await loadJob(db, { jobId, campaignId, kind: 'LEAD_MAGNET_GENERATION' });
  const findExisting = async (l) => {
    const { rows } = await db.query(
      'select id from lead_magnet_tasks where campaign_id = $1 and (post_url = $2 or external_ref = $3) limit 1',
      [campaignId, l.post_url, l.external_ref],
    );
    return rows[0];
  };
  const results = await processItems(db, items, {
    schema: leadItem,
    refOf: stringRef('external_ref'),
    terminal: job.status === 'COMPLETED' || job.status === 'FAILED',
    findExisting,
    insertItem: async (l) => {
      const sameUrl = await db.query('select id from lead_magnet_tasks where campaign_id = $1 and post_url = $2 limit 1', [
        campaignId,
        l.post_url,
      ]);
      if (sameUrl.rows[0]) return { result: 'DUPLICATE', id: sameUrl.rows[0].id };

      const inserted = await db.query(
        `insert into lead_magnet_tasks (campaign_id, job_id, external_ref, platform, author, post_url, post_text,
                                        relevance_reason, comment)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing returning id`,
        [campaignId, jobId, l.external_ref, l.platform, l.author, l.post_url, l.post_text, l.relevance_reason, l.comment],
      );
      if (inserted.rows[0]) return { result: 'CREATED', id: inserted.rows[0].id };
      return { result: 'DUPLICATE', id: (await findExisting(l))?.id };
    },
  });
  const out = tally(results);
  await recordDelivery(db, jobId, out.accepted);
  return out;
}

// ---------------------------------------------------------------------------
// Niche profile (one per job)
// ---------------------------------------------------------------------------
// Returns { created, profile }. A repeated delivery for the same job returns the stored profile.
export async function deliverNicheProfile(db, { jobId, campaignId, profile }) {
  const job = await loadJob(db, { jobId, campaignId, kind: 'NICHE_ANALYSIS' });
  if (job.delivered_count > 0) {
    const { rows } = job.state?.delivered_niche_profile_id
      ? await db.query('select * from niche_profiles where id = $1 and campaign_id = $2', [
          job.state.delivered_niche_profile_id,
          campaignId,
        ])
      : await db.query(
          'select * from niche_profiles where campaign_id = $1 order by version desc limit 2',
          [campaignId],
        );
    if (!rows[0] || (!job.state?.delivered_niche_profile_id && rows.length > 1)) {
      throw conflict('The original profile for this job cannot be identified', 'PROFILE_DELIVERY_REFERENCE_MISSING');
    }
    return { created: false, profile: rows[0] };
  }

  const { rows: latest } = await db.query(
    'select coalesce(max(version), 0)::int as v from niche_profiles where campaign_id = $1',
    [campaignId],
  );
  // A new draft replaces older drafts. An APPROVED profile stays in force until the new one is approved.
  await db.query("update niche_profiles set status = 'SUPERSEDED' where campaign_id = $1 and status = 'DRAFT'", [campaignId]);
  const { rows } = await db.query(
    `insert into niche_profiles (campaign_id, version, profile) values ($1, $2, $3) returning *`,
    [campaignId, latest[0].v + 1, JSON.stringify(profile)],
  );
  await db.query(
    `update integration_jobs set delivered_count = 1, status = 'COMPLETED', completed_at = now(),
            accepted_at = coalesce(accepted_at, now()),
            state = state || jsonb_build_object('delivered_niche_profile_id', $2::text)
      where id = $1`,
    [jobId, rows[0].id],
  );
  return { created: true, profile: rows[0] };
}

// ---------------------------------------------------------------------------
// Job status reported by the service
// ---------------------------------------------------------------------------
const FINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];

export async function updateJobStatus(db, { jobId, status, externalJobId, error }) {
  const { rows } = await db.query('select * from integration_jobs where id = $1 for update', [jobId]);
  const job = rows[0];
  if (!job) throw notFound('No such job');
  if (job.status === status) return job;
  if (FINAL.includes(job.status)) {
    throw conflict(`The job is already ${job.status}`, 'JOB_CLOSED');
  }
  const updated = await db.query(
    `update integration_jobs
        set status = $2::job_status,
            external_job_id = coalesce($3::text, external_job_id),
            error = case when $2::job_status = 'FAILED' then coalesce($4::text, 'Failed without a message') else error end,
            accepted_at = coalesce(accepted_at, now()),
            completed_at = case when $2::job_status in ('COMPLETED', 'FAILED') then now() else completed_at end
      where id = $1 returning *`,
    [jobId, status, externalJobId ?? null, error ? String(error).slice(0, 1000) : null],
  );
  return updated.rows[0];
}
