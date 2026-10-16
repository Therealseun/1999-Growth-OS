import { apifyCatalog } from '../ai/apify-config.js';
import { getConfig } from '../lib/config.js';
import { z } from 'zod';
import { query,withTransaction,asUser,campaign,manager } from './db.js';
import { snapshot,getJob,publicJob } from './jobs.js';
import { conflict,invalid,notFound,forbidden } from '../lib/errors.js';
export async function overview(session,id,offset=0){
 await campaign(session.userId,id);
 const [s,p,j,c,e]=await Promise.all([
  query('select offer,location from growthos_ai.settings where campaign_id=$1',[id]),
  query('select id,version,status,profile,created_at,approved_at from growthos_ai.profiles where campaign_id=$1 order by version desc limit 10',[id]),
  query('select * from growthos_ai.jobs where campaign_id=$1 order by requested_at desc limit 100',[id]),
  query('select * from growthos_ai.candidates where campaign_id=$1 order by created_at desc,id limit 51 offset $2',[id,offset]),
  query("select id,full_name,email from public.profiles where active and role='EMPLOYEE' order by full_name")
 ]);
 return {apify:apifyCatalog(),worker_enabled:getConfig().AI_WORKER_ENABLED,settings:s.rows[0]??null,profiles:p.rows,jobs:j.rows.map(publicJob),candidates:c.rows.slice(0,50),has_more:c.rows.length>50,employees:e.rows};
}
export async function saveSettings(session,id,input){return withTransaction(session.userId,async db=>{
 await campaign(session.userId,id,db,true);
 await db.query(`insert into growthos_ai.settings(campaign_id,offer,location,updated_by) values($1,$2,$3,$4) on conflict(campaign_id) do update set offer=excluded.offer,location=excluded.location,updated_by=excluded.updated_by,updated_at=now()`,[id,input.offer,input.location,session.userId]);return {ok:true};
});}
export async function approveProfile(session,campaignId,profileId){return withTransaction(session.userId,async db=>{
 const c=await campaign(session.userId,campaignId,db,true);
 const {rows:[s]}=await db.query('select * from growthos_ai.settings where campaign_id=$1',[campaignId]);
 const {rows:[p]}=await db.query('select * from growthos_ai.profiles where id=$1 and campaign_id=$2',[profileId,campaignId]);
 if(!p)throw notFound();
 const current=snapshot(c,s??{});
 if(Object.keys(current).some(k=>current[k]!==p.campaign_snapshot[k]))throw conflict('Campaign inputs changed. Analyse again before approval.');
 await db.query("update growthos_ai.profiles set status='SUPERSEDED' where campaign_id=$1 and status='APPROVED'",[campaignId]);
 await db.query("update growthos_ai.profiles set status='APPROVED',approved_by=$2,approved_at=now() where id=$1",[profileId,session.userId]);return {ok:true};
});}
export async function importCandidate(session,id,input){return withTransaction(session.userId,async db=>{
 await manager(session.userId,db);
 const {rows:[c]}=await db.query('select * from growthos_ai.candidates where id=$1 for update',[id]);
 if(!c)throw notFound();
 if(c.disposition!=='NEW')return {disposition:c.disposition,prospect_id:c.prospect_id};
 const record=c.record,email=(input.email??record.email??'').trim().toLowerCase();
 if(!z.string().email().safeParse(email).success)throw invalid('Provide a verified email before importing. Missing emails must not be invented.');
 let {rows:[p]}=await db.query('select id from public.prospects where lower(email)=$1',[email]);
 let disposition='EXISTING';
 if(!p){
  const name=(record.contact_name??'').trim().split(/\s+/);
  const first=input.first_name??name.shift()??'',last=input.last_name??name.join(' ');
  const result=await asUser(db,session.userId,userDb=>userDb.query(`insert into public.prospects(first_name,last_name,email,company,source,campaign_id,status,notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict (lower(email)) do nothing returning id`,[first,last,email,record.organisation,record.research_provider,c.campaign_id,input.status,`Source: ${record.source_url??record.website??'Not supplied'}\nProvider record: ${record.provider_record_id}\nReviewed by manager; AI suggestion: ${c.qualification.status} — ${c.qualification.reason}`]));
  p=result.rows[0];if(p)disposition='IMPORTED';
  else ({rows:[p]}=await db.query('select id from public.prospects where lower(email)=$1',[email]));
 }
 await db.query('update growthos_ai.candidates set disposition=$2,prospect_id=$3,imported_by=$4 where id=$1',[id,disposition,p.id,session.userId]);
 return {disposition,prospect_id:p.id};
});}
export async function cancelJob(session,id){return withTransaction(session.userId,async db=>{
 const j=await getJob(session,id,db,true);
 if(j.status==='COMPLETED'||j.status==='CANCELLED')return publicJob(j);
 if(j.state?.research?.starting)throw conflict('Reconcile the uncertain provider launch before cancelling.');
 const {rows:[out]}=await db.query("update growthos_ai.jobs set status='CANCELLED',lease_token=null,lease_expires_at=null,completed_at=now(),updated_at=now() where id=$1 returning *",[id]);return publicJob(out);
});}
export async function recoverJob(session,id,input){return withTransaction(session.userId,async db=>{
 const actor=await manager(session.userId,db);if(actor.role!=='ADMIN')throw forbidden('An administrator must reconcile uncertain launches.');
 const j=await getJob(session,id,db,true);
 if(j.status!=='FAILED'||!j.state?.research?.starting)throw conflict('This job does not need launch recovery.');
 const state=structuredClone(j.state),provider=state.active_research_provider??j.research_provider;
 if(input.run_id)state.research={run_id:input.run_id,provider,execution_mode:state.research.execution_mode,started_at:Date.now(),offset:0,records:[],invalid:0,duplicates:0};
 else delete state.research;
 const {rows:[out]}=await db.query('update growthos_ai.jobs set state=$2,external_job_id=$3,error_code=null,error=null,updated_at=now() where id=$1 returning *',[id,state,input.run_id??null]);return publicJob(out);
});}
