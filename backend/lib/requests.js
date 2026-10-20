import { insertJob, OPEN_STATUSES } from './jobs.js';
import { requiresNicheApproval } from './appdate.js';

// Builds the requests sent to the AI and Sift services (docs/provider-contract.yaml).
// createRequest() inserts the job row and returns { job, payload }. The caller sends it with dispatchJob()
// after the transaction commits, so no network call ever happens while a transaction is open.

export const campaignBrief = (c) => ({
  id: c.id,
  name: c.name,
  niche: c.niche,
  offer: c.offer,
  location: c.location,
  objective: c.objective,
});

// The profile work is generated from. With approval required, only an APPROVED profile counts.
export async function usableNicheProfile(db, campaignId) {
  const approvalRequired = await requiresNicheApproval(db);
  const { rows } = await db.query(
    `select * from niche_profiles
     where campaign_id = $1 and status = any($2)
     order by (status = 'APPROVED') desc, version desc limit 1`,
    [campaignId, approvalRequired ? ['APPROVED'] : ['APPROVED', 'DRAFT']],
  );
  return rows[0] ?? null;
}

export const MAX_EMAIL_PROSPECTS = 500;
export const MAX_SEARCH_COUNT = 5000;

// Prospects ready for an email: qualified, with an address, no email yet, and not already in an open job.
export async function availableProspects(db, campaignId, limit) {
  const { rows } = await db.query(
    `select p.id, p.organisation, p.contact_name, p.email, p.website, p.industry, p.location
       from prospects p
      where p.campaign_id = $1 and p.qualification_status = 'QUALIFIED' and p.email is not null
        and not exists (select 1 from email_tasks e where e.prospect_id = p.id)
        and p.id::text not in (
          select jsonb_array_elements_text(j.request_payload -> 'prospect_ids')
            from integration_jobs j
           where j.campaign_id = $1 and j.kind = 'EMAIL_GENERATION' and j.status = any($2)
             and j.request_payload ? 'prospect_ids')
      order by p.created_at, p.id
      limit $3`,
    [campaignId, OPEN_STATUSES, limit],
  );
  return rows;
}

// kind: NICHE_ANALYSIS | PROSPECT_SEARCH | EMAIL_GENERATION | SEO_GENERATION | LEAD_MAGNET_GENERATION
// options: { count, prospects } depending on the kind. niche is the profile row (not needed for NICHE_ANALYSIS).
export async function createRequest(db, { campaign, kind, niche, count, prospects }) {
  const brief = campaignBrief(campaign);

  if (kind === 'NICHE_ANALYSIS') {
    const job = await insertJob(db, { campaignId: campaign.id, kind, count: 1 });
    return { job, payload: { job_id: job.id, campaign: brief } };
  }

  if (kind === 'EMAIL_GENERATION') {
    const job = await insertJob(db, {
      campaignId: campaign.id,
      kind,
      count: prospects.length,
      summary: { prospect_ids: prospects.map((p) => p.id) },
    });
    const constraints = niche.profile?.messaging_constraints;
    return {
      job,
      payload: {
        job_id: job.id,
        campaign: brief,
        niche_profile: niche.profile,
        ...(typeof constraints === 'string' ? { messaging_constraints: constraints } : {}),
        prospects,
      },
    };
  }

  const job = await insertJob(db, { campaignId: campaign.id, kind, count });
  const base = { job_id: job.id, campaign: brief, niche_profile: niche.profile, count };

  if (kind === 'PROSPECT_SEARCH') {
    const { rows } = await db.query('select sift_id from prospects where campaign_id = $1', [campaign.id]);
    return { job, payload: { ...base, exclude_sift_ids: rows.map((r) => r.sift_id) } };
  }
  if (kind === 'SEO_GENERATION') {
    const { rows } = await db.query(
      'select topic, primary_keyword from seo_tasks where campaign_id = $1',
      [campaign.id],
    );
    const platforms = niche.profile?.approved_platforms;
    return {
      job,
      payload: {
        ...base,
        existing_topics: [...new Set(rows.flatMap((r) => [r.topic, r.primary_keyword]))],
        ...(Array.isArray(platforms) ? { approved_platforms: platforms } : {}),
      },
    };
  }
  // LEAD_MAGNET_GENERATION
  const { rows } = await db.query('select post_url from lead_magnet_tasks where campaign_id = $1', [campaign.id]);
  return { job, payload: { ...base, exclude_post_urls: rows.map((r) => r.post_url) } };
}
