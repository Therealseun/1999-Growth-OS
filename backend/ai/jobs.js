import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../lib/db.js';
import { assertCanSeeDepartment } from '../lib/guard.js';
import { notFound, conflict, invalid } from '../lib/errors.js';
import { aiConfig } from './config.js';
import { nicheSchema } from './contracts.js';
import { canonicalUrl } from './research.js';
import { selectionForRequest } from './apify-config.js';

const columns = {EMAIL_GENERATION:['email_target_snapshot','carried_in_email'],
  SEO_GENERATION:['seo_target_snapshot','carried_in_seo'], LEAD_MAGNET_GENERATION:['lead_magnet_target_snapshot','carried_in_lead_magnet']};
const canonical = obj => Array.isArray(obj) ? obj.map(canonical) : obj && typeof obj === 'object'
  ? Object.fromEntries(Object.keys(obj).sort().map(k => [k,canonical(obj[k])])) : obj;
export function workloadCount(kind, workload) {
  const keys = columns[kind];
  if (!keys) throw invalid('Unsupported workload kind.');
  return Math.max(0,workload[keys[0]] - workload[keys[1]]);
}

export async function scopedCampaign(session, campaignId, db = {query}) {
  const {rows} = await db.query('select * from campaigns where id=$1',[campaignId]);
  if (!rows[0]) throw notFound();
  assertCanSeeDepartment(session.profile,rows[0].department_id);
  return rows[0];
}
export const publicJob = j => ({id:j.id,campaign_id:j.campaign_id,kind:j.kind,status:j.status,
  workload_id:j.workload_id,requested_count:j.requested_count,delivered_count:j.delivered_count,
  research_provider:j.research_provider,external_job_id:j.external_job_id,error_code:j.error_code,error:j.error,
  active_research_provider:j.state?.active_research_provider ?? j.research_provider,
  apify_connector:j.state?.apify_selection?{id:j.state.apify_selection.id,label:j.state.apify_selection.label}:null,
  research_runs:j.state?.research_runs ?? [],
  requested_at:j.requested_at,completed_at:j.completed_at,next_run_at:j.next_run_at,
  summary:j.state?.summary ? {...j.state.summary,imported:j.delivered_count} : null});

export async function enqueue(session, campaignId, input) {
  const cfg=aiConfig();
  return withTransaction(session.userId, async db => {
    const campaign = await scopedCampaign(session,campaignId,db);
    // Serialise enqueue/dedupe/approval decisions for this campaign only.
    await db.query('select id from campaigns where id=$1 for update',[campaignId]);
    const old=await db.query('select * from integration_jobs where campaign_id=$1 and idempotency_key=$2',[campaignId,input.idempotency_key]);
    if (old.rows[0]) {
      if (JSON.stringify(canonical(old.rows[0].request_payload?.request)) !== JSON.stringify(canonical(input)))
        throw conflict('Idempotency key already belongs to different input.','IDEMPOTENCY_CONFLICT');
      return publicJob(old.rows[0]);
    }
    if (['PAUSED','ARCHIVED'].includes(campaign.status)) throw conflict('Resume the campaign before preparing new work.','CAMPAIGN_INACTIVE');
    let count=1, profile=null, profileId=null;
    if (input.kind !== 'NICHE_ANALYSIS') {
      const p=await db.query("select * from niche_profiles where campaign_id=$1 and status='APPROVED' order by version desc limit 1",[campaignId]);
      if (!p.rows[0]) throw conflict('Approve a niche profile before downstream research or generation.','NICHE_APPROVAL_REQUIRED');
      profile=nicheSchema.parse(p.rows[0].profile); profileId=p.rows[0].id;
    }
    if (columns[input.kind]) {
      if (!input.workload_id || input.requested_count !== undefined) throw invalid('Generation requires workload_id; its count comes from the immutable workload snapshot.');
      const w=await db.query('select * from daily_workloads where id=$1 and campaign_id=$2 for update',[input.workload_id,campaignId]);
      if (!w.rows[0]) throw notFound('Daily workload not found.');
      count=workloadCount(input.kind,w.rows[0]);
      // Existing pool assignments and today's completions also satisfy the snapshot.
      const ws={EMAIL_GENERATION:'EMAIL',SEO_GENERATION:'SEO',LEAD_MAGNET_GENERATION:'LEAD_MAGNET'}[input.kind];
      const {rows:[coverage]}=await db.query(`select count(*)::int as n from v_task_ledger
        where campaign_id=$1 and employee_id=$2 and ws=$3
        and (status_class='OPEN' or (status_class='COMPLETED' and app_date(completed_at)=$4))`,
        [campaignId,w.rows[0].employee_id,ws,w.rows[0].work_date]);
      count=Math.min(count,Math.max(0,w.rows[0][columns[input.kind][0]]-coverage.n));
      const existing=await db.query('select * from integration_jobs where workload_id=$1 and kind=$2',[input.workload_id,input.kind]);
      if (existing.rows[0]) throw conflict('This workload already has a job for this workstream. Retry that job instead.','WORKLOAD_JOB_EXISTS',{job_id:existing.rows[0].id});
    } else if (input.kind === 'PROSPECT_SEARCH') {
      if (!input.requested_count) throw invalid('Prospect search requires requested_count.');
      count=input.requested_count;
    }
    if (count > cfg.AI_MAX_ITEMS_PER_JOB) throw invalid('Count exceeds AI_MAX_ITEMS_PER_JOB. Adjust the operational limit; workload targets remain unchanged.');
    if (input.kind === 'SEO_GENERATION' && !input.approved_platforms.length) throw invalid('Provide approved_platforms for SEO preparation.');
    const provider=input.research_provider ?? cfg.RESEARCH_PROVIDER;
    const payload={request:input,campaign:{id:campaign.id,name:campaign.name,niche:campaign.niche,offer:campaign.offer,location:campaign.location,objective:campaign.objective},
      niche_profile:profile,niche_profile_id:profileId,messaging_constraints:input.messaging_constraints,approved_platforms:input.approved_platforms};
    const selection=selectionForRequest(input,cfg),state=selection?{apify_selection:selection}:{};
    const {rows}=await db.query(`insert into integration_jobs (campaign_id,kind,requested_count,request_payload,idempotency_key,requested_by,workload_id,research_provider,status,completed_at,state)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $3=0 then now() else null end,$10) returning *`,
      [campaignId,input.kind,count,payload,input.idempotency_key,session.userId,input.workload_id ?? null,provider,count===0?'COMPLETED':'REQUESTED',state]);
    return publicJob(rows[0]);
  });
}

export async function getJob(session,id) {
  const {rows}=await query('select * from integration_jobs where id=$1',[id]);
  if (!rows[0]) throw notFound();
  await scopedCampaign(session,rows[0].campaign_id);
  return rows[0];
}
export async function retryJob(session,id, options = {}) {
  await getJob(session,id);
  return withTransaction(session.userId,async db => {
    const {rows}=await db.query('select * from integration_jobs where id=$1 for update',[id]);
    const j=rows[0];
    if (j.status !== 'FAILED') throw conflict('Only failed jobs can be retried.');
    if (j.state?.research?.starting) throw conflict('Research launch outcome is uncertain. Reconcile the existing provider job using the recovery endpoint.','RESEARCH_RECONCILIATION_REQUIRED');
    const state=structuredClone(j.state);
    if(options.apify_connector&&options.research_provider!=='apify')throw invalid('To change the scraper, retry with research_provider=apify.');
    if(options.apify_connector&&options.opportunities)throw invalid('Choose a scraper or supply posts, not both.');
    if (options.research_provider) {
      if (!['PROSPECT_SEARCH','LEAD_MAGNET_GENERATION'].includes(j.kind)) throw invalid('This job has no research provider to switch.');
      if(options.research_provider==='apify'&&(options.apify_connector||!state.apify_selection)){
        const selection=selectionForRequest({kind:j.kind,research_provider:'apify',apify_connector:options.apify_connector});
        if(selection)state.apify_selection=selection;
      }
      delete state.research; delete state.cursor;
      state.active_research_provider=options.research_provider;
      state.sift_query_index=0; state.fallback_used=false;
      state.use_provider=true;
    }
    if (options.opportunities) {
      if (j.kind !== 'LEAD_MAGNET_GENERATION') throw invalid('Opportunities apply only to lead-magnet generation.');
      const records=new Map(options.opportunities.map(o=>[canonicalUrl(o.post_url),{...o,post_url:canonicalUrl(o.post_url)}]));
      state.research={done:true,records:[...records.values()]}; state.cursor=0;
    }
    const out=await db.query(`update integration_jobs set status='REQUESTED',error=null,error_code=null,attempts=0,
      completed_at=null,next_run_at=now(),lease_token=null,lease_expires_at=null,updated_at=now(),state=$2,
      research_provider=coalesce($3,research_provider),external_job_id=case when $3 is not null then null else external_job_id end
      where id=$1 returning *`,[id,state,options.research_provider ?? null]);
    return publicJob(out.rows[0]);
  });
}

// Leases work with Supabase transaction pooling: no session advisory locks.
export async function claimJob() {
  const token=randomUUID();
  return withTransaction(null,async db => {
  const {rows}=await db.query(`update integration_jobs j set status='RUNNING',lease_token=$1,
    lease_expires_at=now()+interval '180 seconds',accepted_at=coalesce(accepted_at,now()),updated_at=now()
    where j.id=(select id from integration_jobs where status in ('REQUESTED','RUNNING') and next_run_at<=now()
      and (lease_expires_at is null or lease_expires_at<now()) and idempotency_key is not null
      order by next_run_at,requested_at for update skip locked limit 1) returning *`,[token]);
  return rows[0] ?? null;
  });
}

export async function checkpoint(job, {state=job.state,delivered=job.delivered_count,done=false,delay=0,write} = {}) {
  return withTransaction(job.requested_by,async db => {
    const owned=await db.query(`select id from integration_jobs where id=$1 and lease_token=$2
      and lease_expires_at>now() and status='RUNNING' for update`,[job.id,job.lease_token]);
    if (!owned.rowCount) throw conflict('Worker lease expired.','LEASE_LOST');
    const result = write ? await write(db) : null;
    if (result?.increment !== undefined) delivered = job.delivered_count + result.increment;
    const {rows}=await db.query(`update integration_jobs set state=$3,delivered_count=$4,status=$5::job_status,
      lease_token=null,lease_expires_at=null,next_run_at=now()+($6 * interval '1 millisecond'),
      completed_at=case when $5::job_status='COMPLETED' then now() else null end,error=null,error_code=null,attempts=0,updated_at=now()
      where id=$1 and lease_token=$2 returning *`,[job.id,job.lease_token,state,delivered,done?'COMPLETED':'RUNNING',delay]);
    return rows[0];
  });
}
