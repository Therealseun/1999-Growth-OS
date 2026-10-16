import { query, withTransaction } from '../lib/db.js';
import { checkpoint, claimJob } from './jobs.js';
import { aiConfig, apifySettings, WorkError } from './config.js';
import { JsonModel } from './model.js';
import { researchProvider, canonicalUrl } from './research.js';
import { siftQueries } from './sift.js';
import { allocateWorkload } from '../lib/task-allocation.js';

async function usage(db, job, u) {
  await db.query('insert into ai_usage (job_id,module,model,prompt_tokens,completion_tokens) values ($1,$2,$3,$4,$5)',
    [job.id,u.module,u.model,u.prompt_tokens,u.completion_tokens]);
}

function sourceContext(job) {
  const p=job.request_payload;
  return {campaign:p.campaign,niche_profile:p.niche_profile,messaging_constraints:p.messaging_constraints,
    approved_platforms:p.approved_platforms};
}

async function persistInFlight(job, state) {
  const mark=await withTransaction(job.requested_by,db=>db.query('update integration_jobs set state=$3 where id=$1 and lease_token=$2 and lease_expires_at>now()',
    [job.id,job.lease_token,state]));
  if (!mark.rowCount) throw new WorkError('LEASE_LOST','Worker lost its lease.');
  job.state=structuredClone(state);
}

const activeProvider = job => job.state.active_research_provider ?? job.research_provider;
const fallbackErrors = new Set(['SIFT_NOT_CONFIGURED','SIFT_UNSUPPORTED_CAPABILITY','SIFT_UNAVAILABLE','SIFT_RATE_LIMITED','SIFT_HTTP_ERROR','SIFT_INVALID_RESPONSE']);

async function advanceResearch(job, cfg, {error=null, moreQueries=true} = {}) {
  if (activeProvider(job) !== 'sift' || job.state.research?.starting) return false;
  const state=structuredClone(job.state), current=state.research ?? {};
  const nextIndex=(state.sift_query_index ?? 0)+1;
  const queries=siftQueries(job.request_payload.niche_profile);
  const another=moreQueries && job.kind === 'PROSPECT_SEARCH' && nextIndex<queries.length && nextIndex<(cfg.SIFT_MAX_JOBS_PER_REQUEST ?? 3);
  const fallback=!another && cfg.RESEARCH_FALLBACK === 'apify' && cfg.APIFY_ENABLED && !state.fallback_used;
  if (!another && !fallback) return false;
  const reason=error ?? current.outcome ?? 'shortfall';
  state.research_runs=[...(state.research_runs ?? []),{provider:'sift',run_id:current.run_id ?? null,
    outcome:reason,collected:current.records?.length ?? 0,invalid:current.invalid ?? 0,duplicates:current.duplicates ?? 0}];
  delete state.research; delete state.cursor;
  if (another) state.sift_query_index=nextIndex;
  else { state.active_research_provider='apify'; state.fallback_used=true; }
  state.summary={...state.summary,active_provider:another?'sift':'apify',imported:job.delivered_count,
    fallback:state.fallback_used ?? false,last_research_outcome:reason};
  await checkpoint(job,{state,write:db=>db.query('update integration_jobs set external_job_id=null where id=$1',[job.id])});
  return true;
}

async function researchStep(job, provider, cfg) {
  const state=structuredClone(job.state), r=state.research ?? {};
  const kind=job.kind === 'PROSPECT_SEARCH' ? 'prospects' : 'opportunities';
  const name=activeProvider(job), remaining=job.requested_count-job.delivered_count;
  provider.validate(kind);
  if(name==='apify'&&!state.apify_selection&&provider.snapshot)state.apify_selection=provider.snapshot(kind);
  if (r.starting) throw new WorkError('RESEARCH_RECONCILIATION_REQUIRED','Research launch may already exist. Recover its run ID before retrying.');
  if (!r.run_id) {
    const p=job.request_payload;
    const queries=kind === 'prospects' ? siftQueries(p.niche_profile) : p.niche_profile.lead_magnet_topics;
    const context={queries,query_text:queries.join('\n'),query_index:state.sift_query_index ?? 0,
      idempotency_key:`${job.id}:${name}:${state.sift_query_index ?? 0}`,
      niche:p.campaign.niche,market:p.campaign.location,count:remaining};
    provider.input?.(kind,context);
    state.research={starting:true,provider:name,execution_mode:name === 'sift' ? cfg.SIFT_EXECUTION_MODE : null};
    await persistInFlight(job,state);
    let run;
    try { run=await provider.start(kind,context); }
    catch (err) {
      // A definite Sift rejection did not create a job. Ambiguous launches stay fenced.
      if (name === 'sift' && err instanceof WorkError && err.code !== 'SIFT_START_UNCERTAIN') {
        delete state.research; await persistInFlight(job,state);
      }
      throw err;
    }
    state.research={run_id:run.id,provider:name,execution_mode:name === 'sift' ? cfg.SIFT_EXECUTION_MODE : null,
      started_at:Date.now(),offset:0,records:[],invalid:0,duplicates:0};
    await checkpoint(job,{state,delay:2000,write:db => db.query('update integration_jobs set external_job_id=$2 where id=$1',[job.id,run.id])});
    return;
  }
  if (name === 'sift' && (r.execution_mode ?? cfg.SIFT_EXECUTION_MODE) !== 'background' && !r.dataset_id && provider.prepare) {
    const remote=await provider.poll(r.run_id,r);
    if (remote.done) {
      r.dataset_id=remote.dataset_id; r.outcome=remote.outcome; state.research=r;
      await checkpoint(job,{state}); return;
    }
    if (!r.prepared) {
      await provider.prepare(r.run_id,r.execution_mode ?? cfg.SIFT_EXECUTION_MODE); r.prepared=true; state.research=r;
      await checkpoint(job,{state}); return;
    }
    if (!r.execution_started) {
      r.execution_started=true; state.research=r;
      await persistInFlight(job,state);
      try {
        const mode=r.execution_mode ?? cfg.SIFT_EXECUTION_MODE ?? 'explicit';
        await provider.execute(r.run_id,remaining,mode);
        r.execution_finished=mode === 'explicit';
      }
      catch (err) {
        if (err.code !== 'SIFT_EXECUTION_UNCERTAIN') {
          // 4xx responses are definite rejections; retrying a 429 is safe.
          r.execution_started=false; await persistInFlight(job,state); throw err;
        }
        r.execution_uncertain=true;
      }
      await checkpoint(job,{state,delay:2000}); return;
    }
    // A timeout/crash after dispatch must never trigger a second run-resolve call.
    await checkpoint(job,{state,delay:5000}); return;
  }
  if (!r.dataset_id) {
    const run=await provider.poll(r.run_id,r);
    if (!run.done) { await checkpoint(job,{state,delay:5000}); return; }
    r.dataset_id=run.dataset_id; r.outcome=run.outcome ?? 'completed'; state.research=r;
    await checkpoint(job,{state}); return;
  }
  const page=await provider.results(kind,r.dataset_id,r.offset,100);
  const records=r.records ?? [], keys=new Set(records.map(v => kind === 'prospects' ? v.email ?? `${v.research_provider}:${v.provider_record_id}` : v.post_url));
  // Remove campaign duplicates before applying the remaining-count limit, so a
  // duplicate at the start of a fallback page cannot hide a useful later row.
  if (kind === 'prospects' && page.records.length) {
    const {rows}=await query(`select email,research_provider,provider_record_id from prospects where campaign_id=$1
      and (email=any($2::text[]) or provider_record_id=any($3::text[]))`,
      [job.campaign_id,page.records.map(v=>v.email).filter(Boolean),page.records.map(v=>v.provider_record_id)]);
    for (const row of rows) { if (row.email) keys.add(row.email); keys.add(`${row.research_provider}:${row.provider_record_id}`); }
  } else if (kind === 'opportunities' && page.records.length) {
    const {rows}=await query('select post_url from lead_magnet_tasks where campaign_id=$1 and post_url=any($2::text[])',
      [job.campaign_id,page.records.map(v=>v.post_url)]);
    for (const row of rows) keys.add(row.post_url);
  }
  for (const record of page.records) {
    const key=kind === 'prospects' ? record.email ?? `${record.research_provider}:${record.provider_record_id}` : record.post_url;
    if (keys.has(key) || (kind === 'prospects' && keys.has(`${record.research_provider}:${record.provider_record_id}`))) { r.duplicates++; continue; }
    keys.add(key); records.push(record);
    if (records.length >= remaining) break;
  }
  r.offset+=page.read; r.invalid+=page.invalid; r.duplicates+=page.duplicates; r.records=records;
  r.done=page.done || records.length >= remaining;
  state.research=r; state.summary={...state.summary,active_provider:name,invalid:r.invalid,duplicates:r.duplicates,collected:records.length,
    imported:job.delivered_count,last_research_outcome:r.outcome};
  await checkpoint(job,{state});
}

export async function step(job, {model,provider,cfg}) {
  const {rows:[campaign]}=await query('select status from campaigns where id=$1',[job.campaign_id]);
  if (!campaign || ['PAUSED','ARCHIVED'].includes(campaign.status)) throw new WorkError('CAMPAIGN_INACTIVE','Campaign is paused or archived.');
  const context=sourceContext(job), state=structuredClone(job.state), count=job.requested_count;
  if (job.delivered_count >= count) { await checkpoint(job,{done:true}); return; }
  if (job.kind === 'NICHE_ANALYSIS') {
    const result=await model.generate('niche',context);
    await checkpoint(job,{delivered:1,done:true,write:async db => {
      await db.query('select id from campaigns where id=$1 for update',[job.campaign_id]);
      await db.query(`insert into niche_profiles (campaign_id,version,profile)
        select $1,coalesce(max(version),0)+1,$2 from niche_profiles where campaign_id=$1`,[job.campaign_id,result.output]);
      await usage(db,job,result.usage);
      if(job.workload_id)await allocateWorkload(db,job.workload_id);
    }}); return;
  }
  if (job.kind === 'PROSPECT_SEARCH' || job.kind === 'LEAD_MAGNET_GENERATION') {
    if (job.kind === 'LEAD_MAGNET_GENERATION' && job.request_payload.request.opportunities && !state.research && !state.use_provider) {
      const unique=new Map(job.request_payload.request.opportunities.map(o => [canonicalUrl(o.post_url),{...o,post_url:canonicalUrl(o.post_url)}]));
      state.research={done:true,records:[...unique.values()]};
      await checkpoint(job,{state}); return;
    }
    if (!state.research?.done) { await researchStep(job,provider,cfg); return; }
    const cursor=state.cursor ?? 0;
    const record=state.research.records[cursor];
    if (!record) {
      if (await advanceResearch(job,cfg)) return;
      throw new WorkError('RESEARCH_SHORTFALL',`Only ${job.delivered_count} of ${count} requested items were prepared. Review the source data.`);
    }
    state.cursor=cursor+1;
    if (job.kind === 'PROSPECT_SEARCH') {
      let qualification={status:'NEEDS_REVIEW',reason:'Awaiting qualification; contact details have not been deliverability-tested.'}, result;
      if (cfg.AI_QUALIFY_PROSPECTS) {
        result=await model.generate('qualify',{...context,prospect:record}); qualification=result.output;
        if (!record.email && qualification.status === 'QUALIFIED') qualification={status:'NEEDS_REVIEW',reason:'No usable email was provided.'};
      }
      await checkpoint(job,{state,write:async db => {
        const {rowCount}=await db.query(`insert into prospects
          (campaign_id,research_provider,provider_record_id,sift_id,organisation,contact_name,email,website,industry,location,qualification_status,qualification_reason,raw)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict do nothing`,
          [job.campaign_id,record.research_provider,record.provider_record_id,record.research_provider==='sift'?record.provider_record_id:null,
            record.organisation,record.contact_name,record.email,record.website,record.industry,record.location,qualification.status,qualification.reason,record]);
        if (result) await usage(db,job,result.usage);
        return {increment:rowCount};
      }}); return;
    }
    const exists=await query('select id from lead_magnet_tasks where campaign_id=$1 and post_url=$2 limit 1',[job.campaign_id,record.post_url]);
    if (exists.rowCount) { await checkpoint(job,{state}); return; }
    const result=await model.generate('comment',{...context,opportunity:record});
    await checkpoint(job,{state,delivered:job.delivered_count+1,write:async db => {
      await db.query('select id from campaigns where id=$1 for update',[job.campaign_id]);
      const exists=await db.query('select id from lead_magnet_tasks where campaign_id=$1 and post_url=$2 limit 1',[job.campaign_id,record.post_url]);
      if (exists.rowCount) return {increment:0};
      await db.query(`insert into lead_magnet_tasks (campaign_id,job_id,external_ref,platform,author,post_url,post_text,relevance_reason,comment)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[job.campaign_id,job.id,`${job.id}:${job.delivered_count}`,record.platform,record.author,record.post_url,record.post_text,result.output.relevance_reason,result.output.comment]);
      await usage(db,job,result.usage);
      if(job.workload_id)await allocateWorkload(db,job.workload_id);
    }}); return;
  }
  if (job.kind === 'EMAIL_GENERATION') {
    const {rows:[prospect]}=await query(`select p.* from prospects p where p.campaign_id=$1 and p.qualification_status='QUALIFIED'
      and p.email is not null and not exists(select 1 from email_tasks t where t.prospect_id=p.id) order by p.created_at,p.id limit 1`,[job.campaign_id]);
    if (!prospect) throw new WorkError('PROSPECT_SHORTFALL','Not enough qualified, unused prospects. Import or qualify more, then retry this job.');
    const result=await model.generate('email',{...context,prospect:{organisation:prospect.organisation,contact_name:prospect.contact_name,
      email:prospect.email,website:prospect.website,industry:prospect.industry,location:prospect.location}});
    const out=result.output;
    const body=out.body.includes(out.cta) ? out.body : `${out.body}\n\n${out.cta}`;
    await checkpoint(job,{delivered:job.delivered_count+1,write:async db => {
      const inserted=await db.query(`insert into email_tasks (campaign_id,prospect_id,job_id,external_ref,subject,body)
        values ($1,$2,$3,$4,$5,$6) on conflict (prospect_id) do nothing`,
        [job.campaign_id,prospect.id,job.id,`${job.id}:${job.delivered_count}`,out.subject,body]);
      await usage(db,job,result.usage);
      if(job.workload_id)await allocateWorkload(db,job.workload_id);
      return {increment:inserted.rowCount};
    }}); return;
  }
  if (job.kind === 'SEO_GENERATION') {
    if (!state.plan) {
      const {rows}=await query('select title from seo_tasks where campaign_id=$1 order by created_at desc limit 100',[job.campaign_id]);
      const result=await model.generate('seo_plan',{...context,existing_titles:rows.map(r => r.title),article_number:job.delivered_count+1});
      if (!context.approved_platforms.includes(result.output.platform)) throw new WorkError('UNAPPROVED_PLATFORM','Model chose a platform outside the approved list.',true);
      if (rows.some(r=>r.title.trim().toLowerCase()===result.output.title.trim().toLowerCase())) throw new WorkError('DUPLICATE_TOPIC','Model repeated an existing article title.',true);
      state.plan=result.output;
      await checkpoint(job,{state,write:db=>usage(db,job,result.usage)}); return;
    }
    const plan=state.plan, result=await model.generate('seo_article',{...context,plan});
    delete state.plan;
    await checkpoint(job,{state,delivered:job.delivered_count+1,write:async db => {
      const o=result.output;
      await db.query(`insert into seo_tasks (campaign_id,job_id,external_ref,topic,primary_keyword,secondary_keywords,search_intent,target_audience,title,article,meta_title,meta_description,cta,platform)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [job.campaign_id,job.id,`${job.id}:${job.delivered_count}`,plan.topic,plan.primary_keyword,plan.secondary_keywords,plan.search_intent,plan.target_audience,plan.title,
          o.article.includes(o.cta)?o.article:`${o.article}\n\n${o.cta}`,o.meta_title,o.meta_description,o.cta,plan.platform]);
      await usage(db,job,result.usage);
      if(job.workload_id)await allocateWorkload(db,job.workload_id);
    }}); return;
  }
  throw new WorkError('UNSUPPORTED_JOB','Unsupported job kind.');
}

export async function runOnce(deps = {}) {
  const cfg=deps.cfg ?? aiConfig(), job=await claimJob();
  if (!job) return null;
  const model=deps.model ?? new JsonModel(cfg);
  let heartbeat;
  try {
    // Each step is bounded. Heartbeat plus fenced transactional saves protect against stale workers.
    heartbeat=setInterval(()=>withTransaction(null,db=>db.query(`update integration_jobs set lease_expires_at=now()+interval '180 seconds'
      where id=$1 and lease_token=$2 and lease_expires_at>now()`,[job.id,job.lease_token])).catch(()=>{}),30000);
    heartbeat.unref?.();
    const provider=deps.provider ?? (deps.providerFactory ?? (name=>researchProvider(name,cfg,name === 'apify' && !job.state.apify_selection ? apifySettings(cfg) : {},undefined,job.state.apify_selection ?? job.request_payload.request.apify_connector)))(activeProvider(job));
    await step(job,{cfg,model,provider});
  } catch (err) {
    const code=err instanceof WorkError ? err.code : err.code === 'LEASE_LOST' ? 'LEASE_LOST' : 'WORKER_ERROR';
    const retry=err.retryable && job.attempts < 2;
    if (!retry && fallbackErrors.has(code) && ['PROSPECT_SEARCH','LEAD_MAGNET_GENERATION'].includes(job.kind)) {
      if (job.state.research?.records?.length && !job.state.research.done) {
        const state=structuredClone(job.state); state.research.done=true; state.research.outcome=code;
        await checkpoint(job,{state}); return job.id;
      }
      if (await advanceResearch(job,cfg,{error:code,moreQueries:false})) return job.id;
    }
    const message=err instanceof WorkError ? err.message : 'Worker failed. Inspect server diagnostics before retrying.';
    await withTransaction(job.requested_by, db=>db.query(`update integration_jobs set status=$3::job_status,error_code=$4,error=$5,
      attempts=attempts+1,lease_token=null,lease_expires_at=null,next_run_at=now()+($6 * interval '1 millisecond'),
      completed_at=case when $3::job_status='FAILED' then now() else null end,updated_at=now()
      where id=$1 and lease_token=$2 and lease_expires_at>now()`,[job.id,job.lease_token,retry?'RUNNING':'FAILED',code,message,err.retryAfterMs ?? 15000]));
    // No prompts, contact data, upstream bodies or credentials in logs.
    console.error(JSON.stringify({event:'ai_job_step_failed',job_id:job.id,code,retry}));
  } finally { clearInterval(heartbeat); }
  return job.id;
}
