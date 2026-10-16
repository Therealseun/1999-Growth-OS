import { randomUUID } from 'node:crypto';
import { query,withTransaction,campaign,manager } from './db.js';
import { notFound,conflict,invalid } from '../lib/errors.js';
import { aiConfig,WorkError } from '../ai/config.js';
import { nicheSchema } from '../ai/contracts.js';
import { canonicalUrl } from '../ai/research.js';
import { selectionForRequest } from '../ai/apify-config.js';
const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const snapshot=(c,s)=>({id:c.id,name:c.name,niche:c.niche,target_audience:c.target_audience,objective:c.objective,offer:s.offer,location:s.location});
export const isGeneration=kind=>['EMAIL_GENERATION','SEO_GENERATION','LEAD_MAGNET_GENERATION'].includes(kind);
export const publicJob=j=>({id:j.id,campaign_id:j.campaign_id,employee_id:j.employee_id,kind:j.kind,status:j.status,requested_count:j.requested_count,delivered_count:j.delivered_count,research_provider:j.state?.active_research_provider??j.research_provider,apify_connector:j.state?.apify_selection?{id:j.state.apify_selection.id,label:j.state.apify_selection.label}:null,external_job_id:j.external_job_id,error_code:j.error_code,error:j.error,requested_at:j.requested_at,completed_at:j.completed_at,summary:j.state?.summary??null,research_runs:j.state?.research_runs??[]});

export async function validateJob(job,db={query}) {
 const c=await campaign(job.requested_by,job.campaign_id,db);
 if(!['DRAFT','ACTIVE'].includes(c.status))throw new WorkError('CAMPAIGN_INACTIVE','Resume the campaign before continuing this job.');
 const {rows:[s]}=await db.query('select * from growthos_ai.settings where campaign_id=$1',[c.id]);
 if(!s||!same(snapshot(c,s),job.request_payload.campaign))throw new WorkError('CAMPAIGN_CHANGED','Campaign inputs changed. Cancel remaining work and request a new job.');
 if(job.employee_id){
  const {rows:[e]}=await db.query('select active,role from public.profiles where id=$1',[job.employee_id]);
  if(!e?.active||e.role!=='EMPLOYEE')throw new WorkError('EMPLOYEE_INACTIVE','Assigned employee is no longer active.');
 }
}
export async function enqueue(session,campaignId,input) {
 return withTransaction(session.userId,async db=>{
  const c=await campaign(session.userId,campaignId,db,true);
  const {rows:[old]}=await db.query('select * from growthos_ai.jobs where campaign_id=$1 and idempotency_key=$2',[campaignId,input.idempotency_key]);
  if(old){if(!same(old.request_payload.request,input))throw conflict('This idempotency key belongs to different input.','IDEMPOTENCY_CONFLICT');return publicJob(old);}
  if(!['DRAFT','ACTIVE'].includes(c.status))throw conflict('Resume the campaign before requesting AI work.','CAMPAIGN_INACTIVE');
  const {rows:[s]}=await db.query('select * from growthos_ai.settings where campaign_id=$1',[campaignId]);
  if(!s)throw conflict('Save the offer and target location first.','AI_SETTINGS_REQUIRED');
  let profile=null,profileId=null;
  const context=snapshot(c,s),count=input.kind==='NICHE_ANALYSIS'?1:input.requested_count;
  if(count>aiConfig().AI_MAX_ITEMS_PER_JOB)throw invalid('Count exceeds AI_MAX_ITEMS_PER_JOB.');
  if(input.kind!=='NICHE_ANALYSIS'){
   const {rows:[p]}=await db.query("select * from growthos_ai.profiles where campaign_id=$1 and status='APPROVED'",[campaignId]);
   if(!p||!same(p.campaign_snapshot,context))throw conflict('Analyse and approve a niche profile for the current campaign inputs first.','NICHE_APPROVAL_REQUIRED');
   profile=nicheSchema.parse(p.profile);profileId=p.id;
  }
  if(isGeneration(input.kind)){
   if(!input.employee_id)throw invalid('Select an employee for generated tasks.');
   // Serialise reservations across all campaigns for this employee.
   const {rows:[e]}=await db.query('select * from public.profiles where id=$1 for update',[input.employee_id]);
   if(!e?.active||e.role!=='EMPLOYEE')throw invalid('Select an active employee.');
   const {rows:[t]}=await db.query('select * from public.workload_targets where role=$1',[e.role]);
   if(!t)throw conflict('Ask your administrator to configure the existing employee workload target.','TARGET_REQUIRED');
   const {rows:[n]}=await db.query(`select count(*) filter(where status<>'COMPLETED')::int as open,
    count(*) filter(where status='COMPLETED' and completed_at>=now()-interval '24 hours')::int as daily,
    count(*) filter(where status='COMPLETED' and completed_at>=now()-interval '7 days')::int as weekly
    from public.tasks where assigned_to=$1`,[e.id]);
   const {rows:[r]}=await db.query("select coalesce(sum(requested_count-delivered_count),0)::int as reserved from growthos_ai.jobs where employee_id=$1 and status in ('REQUESTED','RUNNING','FAILED')",[e.id]);
   if(count>Math.max(0,Math.min(t.daily_task_target-n.open-n.daily-r.reserved,t.weekly_task_target-n.open-n.weekly-r.reserved)))throw conflict('Requested work exceeds remaining employee capacity. Finish existing tasks or cancel remaining AI work first.','CAPACITY_EXCEEDED');
  }else if(input.employee_id)throw invalid('Research does not require an employee assignment.');
  if(input.kind==='SEO_GENERATION'&&!input.approved_platforms.length)throw invalid('Provide approved publishing platforms for SEO.');
  const payload={request:input,campaign:context,niche_profile:profile,niche_profile_id:profileId,messaging_constraints:input.messaging_constraints,approved_platforms:input.approved_platforms};
  const selection=selectionForRequest(input),state=selection?{apify_selection:selection}:{};
  const {rows:[j]}=await db.query(`insert into growthos_ai.jobs(campaign_id,requested_by,employee_id,kind,requested_count,request_payload,idempotency_key,research_provider,state)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[campaignId,session.userId,input.employee_id??null,input.kind,count,payload,input.idempotency_key,input.research_provider??aiConfig().RESEARCH_PROVIDER,state]);
  return publicJob(j);
 });
}
export async function getJob(session,id,db={query},lock=false){
 await manager(session.userId,db);
 const {rows:[j]}=await db.query(`select * from growthos_ai.jobs where id=$1 ${lock?'for update':''}`,[id]);
 if(!j)throw notFound();return j;
}
export async function retryJob(session,id,options={}){
 return withTransaction(session.userId,async db=>{
  const j=await getJob(session,id,db,true);
  if(j.status!=='FAILED')throw conflict('Only failed jobs can be retried.');
  await validateJob(j,db);
  if(j.state?.research?.starting)throw conflict('Recover the existing provider run before retrying.','RESEARCH_RECONCILIATION_REQUIRED');
  const state=structuredClone(j.state);
  if(options.apify_connector&&options.research_provider!=='apify')throw invalid('To change the scraper, retry with research_provider=apify.');
  if(options.apify_connector&&options.opportunities)throw invalid('Choose a scraper or supply posts, not both.');
  if(options.research_provider){
   if(!['PROSPECT_SEARCH','LEAD_MAGNET_GENERATION'].includes(j.kind))throw invalid('This job has no research provider.');
   if(options.research_provider==='apify'&&(options.apify_connector||!state.apify_selection)){
    const selection=selectionForRequest({kind:j.kind,research_provider:'apify',apify_connector:options.apify_connector});
    if(selection)state.apify_selection=selection;
   }
   delete state.research;delete state.cursor;state.active_research_provider=options.research_provider;state.sift_query_index=0;state.fallback_used=false;state.use_provider=true;
  }
  if(options.opportunities){
   if(j.kind!=='LEAD_MAGNET_GENERATION')throw invalid('Post sources apply only to comment tasks.');
   state.research={done:true,records:[...new Map(options.opportunities.map(o=>[canonicalUrl(o.post_url),{...o,post_url:canonicalUrl(o.post_url)}])).values()]};state.cursor=0;
  }
  const {rows:[out]}=await db.query(`update growthos_ai.jobs set status='REQUESTED',error=null,error_code=null,attempts=0,completed_at=null,next_run_at=now(),lease_token=null,lease_expires_at=null,updated_at=now(),state=$2,research_provider=coalesce($3,research_provider),external_job_id=case when $3 is not null then null else external_job_id end where id=$1 returning *`,[id,state,options.research_provider??null]);
  return publicJob(out);
 });
}
export async function claimJob(){
 return withTransaction(null,async db=>{
  const {rows:[j]}=await db.query(`update growthos_ai.jobs set status='RUNNING',lease_token=$1,lease_expires_at=now()+interval '180 seconds',accepted_at=coalesce(accepted_at,now()),updated_at=now()
   where id=(select id from growthos_ai.jobs where status in ('REQUESTED','RUNNING') and next_run_at<=now() and (lease_expires_at is null or lease_expires_at<now()) order by next_run_at,requested_at for update skip locked limit 1) returning *`,[randomUUID()]);return j??null;
 });
}
export async function checkpoint(job,{state=job.state,delivered=job.delivered_count,done=false,delay=0,write}={}){
 return withTransaction(job.requested_by,async db=>{
  const owned=await db.query("select id from growthos_ai.jobs where id=$1 and lease_token=$2 and lease_expires_at>now() and status='RUNNING' for update",[job.id,job.lease_token]);
  if(!owned.rowCount)throw conflict('Worker lease expired.','LEASE_LOST');
  await validateJob(job,db);
  const result=write?await write(db):null;
  if(result?.increment!==undefined)delivered=job.delivered_count+result.increment;
  const {rows:[j]}=await db.query(`update growthos_ai.jobs set state=$3,delivered_count=$4,status=$5,lease_token=null,lease_expires_at=null,next_run_at=now()+($6 * interval '1 millisecond'),completed_at=case when $5='COMPLETED' then now() else null end,error=null,error_code=null,attempts=0,updated_at=now() where id=$1 and lease_token=$2 returning *`,[job.id,job.lease_token,state,delivered,done?'COMPLETED':'RUNNING',delay]);return j;
 });
}
