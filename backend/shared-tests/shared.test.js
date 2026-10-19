import { describe,it,expect,vi,beforeAll,beforeEach,afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
const memory=vi.hoisted(()=>({db:null}));
vi.mock('../lib/db.js',()=>{
 const wrap=db=>({query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0};}});
 return {query:(...args)=>wrap(memory.db).query(...args),withTransaction:(actor,fn)=>memory.db.transaction(tx=>fn(wrap(tx))),closePool:async()=>{}};
});
import { query,withTransaction,asUser,checkBase } from '../shared/db.js';
import { enqueue,claimJob,checkpoint,getJob,retryJob } from '../shared/jobs.js';
import { saveSettings,approveProfile,importCandidate,cancelJob,recoverJob } from '../shared/service.js';
import { runOnce } from '../shared/processor.js';
import { jobSchema } from '../shared/contracts.js';
import { aiConfig,WorkError } from '../ai/config.js';
import { SiftProvider } from '../ai/sift.js';
import { apifyCatalog } from '../ai/apify-config.js';
import { resetConfigForTests } from '../lib/config.js';
import { createApp } from '../app.js';
const profile={industry:'Education',market:'Nigeria',organisation_types:['School'],audiences:['Owners'],decision_makers:['Owner'],job_titles:['Owner'],geographic_segments:['Lagos'],pain_points:['Workload'],buying_motivations:['Support'],keywords:['tutoring'],search_queries:['Schools Lagos'],platforms:['Web'],prospect_strategy:'Public school contact pages',outreach_angles:['Support'],seo_angles:['Tutoring'],lead_magnet_topics:['Learning'],exclusions:['Unrelated'],assumptions:['Verify needs']};
const outputs={niche:profile,email:{subject:'Learning support',body:'Hello, let us discuss learning support.',cta:'Would a conversation help?'},seo_plan:{topic:'Tutoring',primary_keyword:'tutoring',secondary_keywords:['learning'],search_intent:'informational',target_audience:'Owners',title:'Supporting learning',platform:'Company blog'},seo_article:{article:'Reviewable education article. '.repeat(30),meta_title:'Learning',meta_description:'Useful learning support.',cta:'Learn more.'},comment:{comment:'A relevant and helpful comment.',relevance_reason:'The source discusses learning.'},qualify:{status:'QUALIFIED',reason:'Relevant school.'}};
const model={generate:vi.fn(async module=>({output:structuredClone(outputs[module]),usage:{module,model:'fixture',prompt_tokens:2,completion_tokens:3}}))};
const cfg=aiConfig({AI_ENABLED:'false',AI_QUALIFY_PROSPECTS:'true'});
let admin,employee,campaignId,app,beforeCatalog,afterCatalog;
async function catalog(){return (await query(`select jsonb_build_object(
 'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
 'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'growthos_%'),
 'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgrelid,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'constraints',(select jsonb_agg(pg_get_constraintdef(c.oid) order by c.conrelid,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')
 ) as snapshot`)).rows[0].snapshot;}
async function user(role){const id=randomUUID();await query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);await query('insert into public.profiles(id,email,full_name,role) values($1,$2,$3,$4) on conflict(id) do update set full_name=excluded.full_name,role=excluded.role',[id,id+'@example.test',role,role]);return {userId:id,profile:{id,role,status:'ACTIVE'}};}
async function job(kind,more={}){return enqueue(admin,campaignId,jobSchema.parse({kind,idempotency_key:randomUUID(),...(/GENERATION/.test(kind)?{employee_id:employee.userId,approved_platforms:['Company blog']}:{}),...more}));}
async function tick(n=1,extra={}){for(let i=0;i<n;i++){await query("update growthos_ai.jobs set next_run_at=now()-interval '1 second' where status in ('REQUESTED','RUNNING')");await runOnce({cfg,model,provider:{validate(){},input(){},start:async()=>({id:'fixture-run'}),poll:async()=>({done:true,dataset_id:'fixture-data'}),results:async()=>({records:[],read:0,invalid:0,duplicates:0,done:true})},...extra});}}
async function approve(){const j=await job('NICHE_ANALYSIS');await tick();const {rows:[p]}=await query('select id from growthos_ai.profiles where campaign_id=$1 order by version desc',[campaignId]);await approveProfile(admin,campaignId,p.id);return j;}
async function candidate(email=null){const j=await job('PROSPECT_SEARCH');const record={organisation:'School',contact_name:null,email,website:'https://example.test',source_url:'https://example.test/contact',research_provider:'sift',provider_record_id:randomUUID()};const {rows:[c]}=await query(`insert into growthos_ai.candidates(campaign_id,job_id,record,research_provider,provider_record_id,qualification) values($1,$2,$3,'sift',$4,$5) returning *`,[campaignId,j.id,record,record.provider_record_id,{status:'NEEDS_REVIEW',reason:'Check contact'}]);await cancelJob(admin,j.id);return c;}
async function signed(session){const jwt=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(session.userId).setIssuer('https://test.supabase.co/auth/v1').setAudience('authenticated').setExpirationTime('1h').sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));return {Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'};}
beforeAll(async()=>{
 Object.assign(process.env,{GROWTHOS_SCHEMA:'shared',DATABASE_URL:'postgres://unused',SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_JWT_SECRET:'fixture-secret-long-enough',CRON_SECRET:'x'.repeat(40),AI_ENABLED:'false'});resetConfigForTests();
 memory.db=new PGlite();await memory.db.exec(readFileSync(new URL('./fixtures/live-schema.sql',import.meta.url),'utf8'));
 beforeCatalog=await catalog();
 // Seed an existing record before installation to verify preservation too.
 await query("insert into auth.users values('00000000-0000-4000-8000-000000000001','existing@example.test','{}')");
 await query("insert into profiles(id,email,full_name) values('00000000-0000-4000-8000-000000000001','existing@example.test','Existing teammate') on conflict(id) do update set full_name=excluded.full_name");
 await memory.db.exec(readFileSync(new URL('../shared/migrations/0001_ai_extension.sql',import.meta.url),'utf8'));
 afterCatalog=await catalog();
 expect((await query("select full_name from profiles where email='existing@example.test'")).rows[0].full_name).toBe('Existing teammate');
 const modules=import.meta.glob('../shared/routes/**/route.js');
 app=await createApp({loadRoute:file=>Object.entries(modules).find(([key])=>file.endsWith(key.slice(2)))[1]()});
});
beforeEach(async()=>{
 model.generate.mockClear();await memory.db.exec('truncate auth.users,public.profiles,public.workload_targets cascade');
 admin=await user('ADMIN');employee=await user('EMPLOYEE');campaignId=randomUUID();
 await query("insert into public.campaigns(id,name,niche,target_audience,objective,status,owner_id) values($1,'Schools','Education','Owners','Conversations','ACTIVE',$2)",[campaignId,admin.userId]);
 await query("insert into public.workload_targets(role,daily_task_target,weekly_task_target) values('EMPLOYEE',10,50)");
 await saveSettings(admin,campaignId,{offer:'Learning support',location:'Lagos'});
});
afterAll(async()=>{await memory.db?.close();});
describe('shared team database compatibility',()=>{
 it('adds only isolated storage; preserves every exported public column, policy, function, trigger and constraint',async()=>{expect(afterCatalog).toEqual(beforeCatalog);await checkBase();await expect(withTransaction(employee.userId,db=>asUser(db,employee.userId,d=>d.query('select * from growthos_ai.jobs')))).rejects.toThrow(/permission denied/);});
 it('mounts shared routes, validates identity and refuses inactive/employee callers',async()=>{
  expect((await app.request('/api/health')).status).toBe(200);
  expect((await app.request('/api/workspace',{headers:await signed(admin)})).status).toBe(404);
  expect((await app.request(`/api/ai/campaigns/${campaignId}`)).status).toBe(401);
  expect((await app.request(`/api/ai/campaigns/${campaignId}`,{headers:await signed(employee)})).status).toBe(403);
  expect((await app.request(`/api/ai/campaigns/${campaignId}`,{headers:await signed(admin)})).status).toBe(200);
  await query('update public.profiles set active=false where id=$1',[admin.userId]);
  expect((await app.request(`/api/ai/campaigns/${campaignId}`,{headers:await signed(admin)})).status).toBe(403);
 });
 it('requires current approval and deduplicates identical requests',async()=>{
  await expect(job('PROSPECT_SEARCH')).rejects.toMatchObject({code:'NICHE_APPROVAL_REQUIRED'});await approve();
  const input=jobSchema.parse({kind:'PROSPECT_SEARCH',idempotency_key:'stable',requested_count:2});const a=await enqueue(admin,campaignId,input),b=await enqueue(admin,campaignId,input);expect(a.id).toBe(b.id);
  await expect(enqueue(admin,campaignId,{...input,requested_count:3})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await saveSettings(admin,campaignId,{offer:'Changed offer',location:'Lagos'});await expect(job('PROSPECT_SEARCH')).rejects.toMatchObject({code:'NICHE_APPROVAL_REQUIRED'});
 });
 it('imports reviewed contacts without inventing names; preserves globally duplicate emails',async()=>{
  await approve();const c=await candidate();await expect(importCandidate(admin,c.id,{status:'SEED'})).rejects.toMatchObject({status:422});
  const out=await importCandidate(admin,c.id,{email:'Verified@example.test',status:'QUALIFIED'});const p=(await query('select * from public.prospects where id=$1',[out.prospect_id])).rows[0];expect(p.first_name).toBe('');expect(p.email).toBe('verified@example.test');expect(p.status).toBe('QUALIFIED');
  await query('update public.prospects set campaign_id=null,notes=$2 where id=$1',[p.id,'Team-owned notes']);
  const dup=await candidate('VERIFIED@example.test');expect((await importCandidate(admin,dup.id,{status:'SEED'})).disposition).toBe('EXISTING');
  const preserved=(await query('select * from public.prospects where id=$1',[p.id])).rows[0];expect(preserved.campaign_id).toBeNull();expect(preserved.notes).toBe('Team-owned notes');expect(preserved.status).toBe('QUALIFIED');
 });
 it('stages incomplete Sift contacts without touching public prospects',async()=>{
  await approve();const j=await job('PROSPECT_SEARCH');
  const rec={research_provider:'sift',provider_record_id:'s1',organisation:'School',contact_name:null,email:null,website:null,industry:null,location:null,source_url:null};
  await query('update growthos_ai.jobs set state=$2 where id=$1',[j.id,{research:{done:true,records:[rec]}}]);await tick(2);
  expect((await getJob(admin,j.id)).status).toBe('COMPLETED');expect((await query('select * from public.prospects')).rows).toHaveLength(0);expect((await query('select qualification from growthos_ai.candidates')).rows[0].qualification.status).toBe('NEEDS_REVIEW');
 });
 it('delivers email, SEO and comment drafts into existing tasks with no asset/audit overwrite',async()=>{
  await approve();const c=await candidate('school@example.test');await importCandidate(admin,c.id,{status:'QUALIFIED'});
  const email=await job('EMAIL_GENERATION');await tick(2);expect((await getJob(admin,email.id)).status).toBe('COMPLETED');
  const seo=await job('SEO_GENERATION');await tick(3);expect((await getJob(admin,seo.id)).status).toBe('COMPLETED');
  const comment=await job('LEAD_MAGNET_GENERATION',{opportunities:[{platform:'LinkedIn',author:'Author',post_url:'https://example.test/post',post_text:'Learning in schools.'}]});await tick(3);expect((await getJob(admin,comment.id)).status).toBe('COMPLETED');
  const tasks=(await query('select * from public.tasks')).rows;expect(tasks).toHaveLength(3);expect(new Set(tasks.map(t=>t.type))).toEqual(new Set(['EMAIL','SEO','LEAD_MAGNET']));expect(tasks.every(t=>t.status==='PENDING'&&t.assigned_to===employee.userId)).toBe(true);
  const draft=(await query('select * from public.email_drafts')).rows[0];expect(draft.status).toBe('DRAFT');expect(draft.created_by).toBe(employee.userId);expect(draft.sent_at).toBeNull();
  expect((await query('select * from public.seo_audits')).rows).toHaveLength(0);expect((await query('select * from public.lead_magnets')).rows).toHaveLength(0);expect((await query('select * from public.workload_snapshots')).rows).toHaveLength(0);
  const visible=await withTransaction(employee.userId,db=>asUser(db,employee.userId,d=>d.query('select * from public.tasks')));expect(visible.rows).toHaveLength(3);
  await expect(withTransaction(employee.userId,db=>asUser(db,employee.userId,d=>d.query('update public.tasks set title=$2 where id=$1',[tasks[0].id,'Tamper'])))).rejects.toThrow();
  await withTransaction(employee.userId,db=>asUser(db,employee.userId,d=>d.query("update public.tasks set status='COMPLETED' where id=$1",[tasks[0].id])));
  expect((await query('select * from public.workload_snapshots')).rows).toHaveLength(3);expect((await query('select completed_at from public.tasks where id=$1',[tasks[0].id])).rows[0].completed_at).toBeTruthy();
  const outsider=await user('EMPLOYEE');expect((await withTransaction(outsider.userId,db=>asUser(db,outsider.userId,d=>d.query('select * from public.tasks')))).rows).toHaveLength(0);
 });
 it('reserves capacity across jobs, retains failed reservations, and releases cancellation',async()=>{
  await approve();await query("update public.workload_targets set daily_task_target=2 where role='EMPLOYEE'");
  const j=await job('SEO_GENERATION',{requested_count:2});await expect(job('EMAIL_GENERATION')).rejects.toMatchObject({code:'CAPACITY_EXCEEDED'});
  await query("update growthos_ai.jobs set status='FAILED' where id=$1",[j.id]);await expect(job('EMAIL_GENERATION')).rejects.toMatchObject({code:'CAPACITY_EXCEEDED'});
  await cancelJob(admin,j.id);expect((await job('SEO_GENERATION',{requested_count:2})).status).toBe('REQUESTED');
 });
 it('fences stale saves and checks requester activation before calling a model',async()=>{
  await approve();await job('SEO_GENERATION');const j=await claimJob();await query("update growthos_ai.jobs set lease_expires_at=now()-interval '1 second' where id=$1",[j.id]);
  await expect(checkpoint(j,{write:db=>db.query('delete from public.prospects')})).rejects.toMatchObject({code:'LEASE_LOST'});
  model.generate.mockClear();await query('update public.profiles set active=false where id=$1',[admin.userId]);await tick();expect(model.generate).not.toHaveBeenCalled();expect((await query("select * from public.tasks")).rows).toHaveLength(0);
 });
 it('keeps partial email output on retry without creating duplicate drafts',async()=>{
  await approve();await importCandidate(admin,(await candidate('first@example.test')).id,{status:'QUALIFIED'});const j=await job('EMAIL_GENERATION',{requested_count:2});await tick(2);expect((await getJob(admin,j.id)).status).toBe('FAILED');
  await importCandidate(admin,(await candidate('second@example.test')).id,{status:'QUALIFIED'});await retryJob(admin,j.id);await tick(2);
  expect((await getJob(admin,j.id)).delivered_count).toBe(2);expect((await query('select * from public.email_drafts')).rows).toHaveLength(2);
 });
 it('continues partial research through Apify and deduplicates staged results before filling the remainder',async()=>{
  await approve();const j=await job('PROSPECT_SEARCH',{requested_count:2});
  const record=(id,email,provider)=>({research_provider:provider,provider_record_id:id,organisation:'School '+id,contact_name:null,email,website:null,industry:null,location:null,source_url:null});
  const calls=[];
  const providerFactory=name=>({validate(){},input(){},start:async(kind,context)=>{calls.push([name,context.count]);return {id:name+'-run'};},poll:async()=>({done:true,dataset_id:name+'-data'}),results:async()=>({records:name==='sift'?[record('s1','same@example.test','sift')]:[record('a1','same@example.test','apify'),record('a2','new@example.test','apify')],read:name==='sift'?1:2,invalid:0,duplicates:0,done:true})});
  for(let i=0;i<20;i++){await query("update growthos_ai.jobs set next_run_at=now()-interval '1 second'");await runOnce({model,cfg:{...cfg,RESEARCH_FALLBACK:'apify',APIFY_ENABLED:true,SIFT_EXECUTION_MODE:'background',SIFT_MAX_JOBS_PER_REQUEST:1},providerFactory});if((await getJob(admin,j.id)).status==='COMPLETED')break;}
  expect((await getJob(admin,j.id)).status).toBe('COMPLETED');expect(calls).toEqual([['sift',2],['apify',1]]);
  expect((await query('select * from growthos_ai.candidates')).rows).toHaveLength(2);expect((await query('select * from public.prospects')).rows).toHaveLength(0);
 });
 it('falls back to Apify after definite Sift unavailability, without an ambiguous-launch duplicate',async()=>{
  await approve();const j=await job('PROSPECT_SEARCH');
  await tick(1,{cfg:{...cfg,RESEARCH_FALLBACK:'apify',APIFY_ENABLED:true},provider:{validate(){throw new WorkError('SIFT_UNAVAILABLE','Unavailable');}}});
  expect((await getJob(admin,j.id)).state.active_research_provider).toBe('apify');
  await query('update growthos_ai.jobs set state=$2 where id=$1',[j.id,{research:{starting:true,provider:'apify'}}]);await tick();
  expect((await getJob(admin,j.id)).error_code).toBe('RESEARCH_RECONCILIATION_REQUIRED');await expect(retryJob(admin,j.id,{research_provider:'sift'})).rejects.toMatchObject({code:'RESEARCH_RECONCILIATION_REQUIRED'});
  await recoverJob(admin,j.id,{run_id:'known-existing-run'});await retryJob(admin,j.id);expect((await getJob(admin,j.id)).state.research.run_id).toBe('known-existing-run');
 });
 it.each(['normal','ambiguous','busy'])('runs the current Sift create/start/poll/results flow (%s) without premature delivery or duplicate starts',async(scenario)=>{
  await approve();const j=await job('PROSPECT_SEARCH',{requested_count:1});
  const config={...cfg,SIFT_ENABLED:true,SIFT_BASE_URL:'https://sift.example.test',SIFT_API_KEY:'fixture-token',SIFT_OWNER_EMAIL:'owner@example.test',SIFT_EXECUTION_MODE:'start',SIFT_MAX_JOBS_PER_REQUEST:1};
  let started=false,polls=0,startCalls=0,complete=false;
  const http=vi.fn(async(url,options)=>{
   if(url.endsWith('/api/discover/jobs'))return Response.json({ok:true,jobId:'current-sift-job',job:{status:'pending'}});
   if(url.endsWith('/start')){
    startCalls++;
    if(scenario==='busy'&&startCalls===1)return Response.json({error:'busy'},{status:503});
    started=true;
    if(scenario==='ambiguous')throw new Error('socket lost after upstream accepted start');
    return Response.json({ok:true,alreadyRunning:false,job:{status:'pending'}});
   }
   if(url.includes('/results?')){
    expect(complete).toBe(true);
    return Response.json({ok:true,total:1,results:[{id:301,job_id:'current-sift-job',business_name:'Evidence school',email:'school@example.test',address:'Abuja',phone:'+2348000000000',metadata:{osmId:'node/301'}}]});
   }
   if(url.endsWith('/current-sift-job')&&options.method==='GET'){
    if(started&&++polls>=3)complete=true;
    return Response.json({ok:true,job:{id:'current-sift-job',status:complete?'completed':started?'running':'pending'}});
   }
   throw new Error('Unexpected endpoint: '+url);
  });
  const provider=new SiftProvider(config,http);
  for(let i=0;i<20;i++){
   await tick(1,{cfg:config,provider});
   if(!complete)expect((await query('select * from growthos_ai.candidates')).rows).toHaveLength(0);
   if((await getJob(admin,j.id)).status==='COMPLETED')break;
  }
  expect((await getJob(admin,j.id)).status).toBe('COMPLETED');
  expect(startCalls).toBe(scenario==='busy'?2:1);
  expect(http.mock.calls.filter(([url])=>url.endsWith('/api/discover/jobs'))).toHaveLength(1);
  expect(http.mock.calls.some(([url])=>/rephrase|run-resolve|osm-lookup/.test(url))).toBe(false);
  const staged=(await query('select * from growthos_ai.candidates')).rows;
  expect(staged).toHaveLength(1);expect(staged[0].record.email).toBe('school@example.test');
  expect((await query('select * from public.prospects')).rows).toHaveLength(0);
 });
});


async function usingApify(run){
 const directory=mkdtempSync(join(tmpdir(),'growthos-apify-')),path=join(directory,'apify.json');
 const settings={version:2,defaults:{prospects:'maps',opportunities:'posts'},connectors:{
  maps:{label:'School finder',kind:'prospects',task_id:'original-task',input:{search:'{{query_text}}',privateOption:'private-template-value'},fields:{organisation:'name',email:'email'}},
  alternate:{label:'Directory finder',kind:'prospects',task_id:'alternate-task',input:{},fields:{organisation:'company',email:'mail'}},
  posts:{label:'Post finder',kind:'opportunities',task_id:'posts-task',input:{},fields:{post_url:'url',post_text:'text'},constants:{platform:'LinkedIn'}}
 }};
 writeFileSync(path,JSON.stringify(settings));
 const env={APIFY_ENABLED:'true',APIFY_CONFIG_FILE:path,APIFY_TOKEN:'private-apify-token',RESEARCH_FALLBACK:'apify'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 try{await run({path,settings,config:aiConfig()});}
 finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;rmSync(directory,{recursive:true,force:true});}
}
describe('Apify task selection in the shared workflow',()=>{
 it('validates kind and task name before enqueue and does not expose task templates in the overview',async()=>{
  await approve();await usingApify(async()=>{
   await expect(job('PROSPECT_SEARCH',{research_provider:'apify',apify_connector:'posts'})).rejects.toMatchObject({code:'APIFY_CONFIG_INVALID'});
   await expect(job('PROSPECT_SEARCH',{research_provider:'apify',apify_connector:'missing'})).rejects.toMatchObject({code:'APIFY_CONFIG_INVALID'});
   expect((await query("select * from growthos_ai.jobs where kind='PROSPECT_SEARCH'")).rows).toHaveLength(0);
   const res=await app.request(`/api/ai/campaigns/${campaignId}`,{headers:await signed(admin)});
   const text=await res.text();
   expect(res.status).toBe(200);expect(text).toContain('School finder');
   expect(text).not.toContain('private-apify-token');expect(text).not.toContain('private-template-value');expect(text).not.toContain('original-task');
   expect(apifyCatalog().connectors).toHaveLength(3);
  });
 });
 it('pins the selected task and field mapping for a queued job across configuration changes',async()=>{
  await approve();await usingApify(async({path,settings,config})=>{
   const j=await job('PROSPECT_SEARCH',{research_provider:'apify',apify_connector:'maps'});
   settings.connectors.maps.task_id='changed-task';settings.connectors.maps.fields={organisation:'changedName'};writeFileSync(path,JSON.stringify(settings));
   const http=vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>{
    if(url.includes('/actor-tasks/')){expect(url).toContain('/original-task/');return Response.json({data:{id:'apify-run'}});}
    if(url.includes('/actor-runs/'))return Response.json({data:{status:'SUCCEEDED',defaultDatasetId:'apify-data'}});
    return Response.json([{name:'School',email:'school@example.test'}]);
   });
   try{
    for(let i=0;i<10;i++){await query("update growthos_ai.jobs set next_run_at=now()-interval '1 second'");await runOnce({cfg:config,model});if((await getJob(admin,j.id)).status==='COMPLETED')break;}
    expect((await getJob(admin,j.id)).status).toBe('COMPLETED');
    const candidates=(await query('select * from growthos_ai.candidates')).rows;expect(candidates).toHaveLength(1);expect(candidates[0].record.organisation).toBe('School');
    expect(http.mock.calls.filter(([url])=>url.includes('/actor-tasks/'))).toHaveLength(1);
   }finally{http.mockRestore();}
  });
 });
 it('retains the chosen Apify fallback when Sift is unavailable',async()=>{
  await approve();await usingApify(async({config})=>{
   const j=await job('PROSPECT_SEARCH',{research_provider:'sift',apify_connector:'alternate'});
   await tick(1,{cfg:{...config,SIFT_ENABLED:false},provider:new SiftProvider({SIFT_ENABLED:false})});
   const saved=await getJob(admin,j.id);expect(saved.state.active_research_provider).toBe('apify');expect(saved.state.apify_selection.task_id).toBe('alternate-task');
  });
 });
 it('switches tasks only on explicit retry and blocks switching an uncertain launch',async()=>{
  await approve();await usingApify(async()=>{
   const j=await job('PROSPECT_SEARCH',{research_provider:'apify',apify_connector:'maps'});
   await query("update growthos_ai.jobs set status='FAILED',state=state || $2::jsonb where id=$1",[j.id,{research:{run_id:'old-run',done:true,records:[]}}]);
   await retryJob(admin,j.id);expect((await getJob(admin,j.id)).state.apify_selection.id).toBe('maps');
   await query("update growthos_ai.jobs set status='FAILED' where id=$1",[j.id]);
   const switched=await retryJob(admin,j.id,{research_provider:'apify',apify_connector:'alternate'});expect(switched.apify_connector.id).toBe('alternate');expect(switched.external_job_id).toBeNull();
   await query("update growthos_ai.jobs set status='FAILED',state=state || $2::jsonb where id=$1",[j.id,{research:{starting:true}}]);
   await expect(retryJob(admin,j.id,{research_provider:'apify',apify_connector:'maps'})).rejects.toMatchObject({code:'RESEARCH_RECONCILIATION_REQUIRED'});
  });
 });
});
