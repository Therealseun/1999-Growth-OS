"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { apiClient } from "@/lib/api";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";

type ApifyChoice = { id:string; label:string; kind:"prospects"|"opportunities" };
type ApifyCatalog = { enabled:boolean; defaults:Partial<Record<"prospects"|"opportunities",string>>; connectors:ApifyChoice[]; error:string|null };
type Job = { apify_connector?:{id:string;label:string}|null; id:string; kind:string; status:string; requested_count:number; delivered_count:number; research_provider:string; external_job_id:string|null; error:string|null; error_code:string|null };
type Candidate = { id:string; disposition:string; prospect_id:string|null; record:{organisation:string;contact_name:string|null;email:string|null;source_url:string|null;website:string|null}; qualification:{status:string;reason:string} };
type Overview = { apify?:ApifyCatalog; worker_enabled:boolean; settings:{offer:string;location:string}|null; profiles:{id:string;version:number;status:string;profile:Record<string,string|string[]>}[]; jobs:Job[]; candidates:Candidate[];has_more:boolean; employees:{id:string;full_name:string;email:string}[] };
const field="w-full rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface)] p-2 text-sm";
const label="flex flex-col gap-2 text-sm";
const safeUrl=(value:string|null)=>{try{const u=new URL(value??'');return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};

export function AiPanel({campaignId}:{campaignId:string}) {
 const {user}=useAuth();
 if(!user||!['ADMIN','MANAGER'].includes(user.role))return <Card>Managers prepare AI work here. Your assigned drafts appear in Tasks.</Card>;
 return <ManagerPanel key={campaignId} campaignId={campaignId} admin={user.role==='ADMIN'}/>;
}
function ManagerPanel({campaignId,admin}:{campaignId:string;admin:boolean}) {
 const base=`/ai/campaigns/${campaignId}`,client=useQueryClient();
 const [offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [employee,setEmployee]=useState(''),[count,setCount]=useState(1),[kind,setKind]=useState('EMAIL_GENERATION'),[provider,setProvider]=useState('sift'),[platforms,setPlatforms]=useState('Company blog'),[constraints,setConstraints]=useState('');
 const [postUrl,setPostUrl]=useState(''),[postText,setPostText]=useState(''),[postPlatform,setPostPlatform]=useState('LinkedIn'),[author,setAuthor]=useState('');
 const [prospectScraper,setProspectScraper]=useState(''),[postScraper,setPostScraper]=useState('');
 const pendingKeys=useRef(new Map<string,string>());
 const q=useQuery({queryKey:['ai-campaign',campaignId,offset],queryFn:()=>apiClient.get<Overview>(`${base}?offset=${offset}`),refetchInterval:5000,retry:false});
 async function act(fn:()=>Promise<unknown>,message='Saved.') {
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const result=await fn();setNotice(typeof result==='string'?result:message);await client.invalidateQueries({queryKey:['ai-campaign',campaignId]});await client.invalidateQueries({queryKey:['prospects']});}
  catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}
 }
 async function queue(input:Record<string,unknown>){
  const signature=JSON.stringify(input),key=pendingKeys.current.get(signature)??crypto.randomUUID();pendingKeys.current.set(signature,key);
  await apiClient.post(`${base}/jobs`,{...input,idempotency_key:key});pendingKeys.current.delete(signature);
 }
 if(q.isPending)return <Card>Loading AI workspace…</Card>;
 if(q.error&&!q.data)return <Card><p role="alert">{q.error.message}</p><p className="mt-2 text-sm">Your existing screens are still available. Check the backend and the additive AI extension setup in START-HERE.md.</p><Button className="mt-3" onClick={()=>q.refetch()}>Retry connection</Button></Card>;
 const data=q.data!;
 const apify=data.apify??{enabled:false,defaults:{},connectors:[],error:null};
 const canUseApify=(type:"prospects"|"opportunities",selected:string)=>apify.enabled&&apify.connectors.some(c=>c.kind===type&&c.id===(selected||apify.defaults[type]));
 const selectApify=(selected:string)=>selected?{apify_connector:selected}:{};
 return <div className="space-y-5">
  {!data.worker_enabled&&<p role="status" className="rounded-lg border border-[var(--color-luxe-border)] p-3 text-sm">The AI worker is disabled. Jobs will stay queued until your connector administrator enables it.</p>}
  <p className="text-sm text-[var(--color-luxe-muted)]">Prepare research and drafts, review them, then use your team’s existing Tasks and Email screens. Nothing is sent or published automatically.</p>
  {(error||notice||q.error)&&<p role={error||q.error?'alert':'status'} className="rounded-lg border border-[var(--color-luxe-border)] p-3 text-sm">{error||q.error?.message||notice}</p>}
  <Card><CardHeader><CardTitle>1. Campaign context</CardTitle></CardHeader>
   <form key={JSON.stringify(data.settings)} className="space-y-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act(()=>apiClient.patch(base,{offer:f.get('offer'),location:f.get('location')}));}}>
    <label className={label}>Offer<textarea name="offer" className={field} defaultValue={data.settings?.offer??''} required maxLength={4000} placeholder="What are you offering these prospects?"/></label>
    <label className={label}>Target location<input name="location" className={field} defaultValue={data.settings?.location??''} required maxLength={500} placeholder="For example: Lagos, Nigeria"/></label>
    <Button type="submit" disabled={busy}>Save context</Button>
   </form>
   <Button variant="secondary" className="mt-3" disabled={busy||!data.settings} onClick={()=>act(()=>queue({kind:'NICHE_ANALYSIS'}),'Analysis queued. Leave the worker running to prepare it.')}>Analyse niche</Button>
   <p className="mt-2 text-xs">Changing campaign details or this context requires a fresh analysis and approval before new downstream jobs.</p>
  </Card>
  {data.profiles.length>0&&<Card><CardHeader><CardTitle>2. Review niche profile</CardTitle></CardHeader><div className="space-y-3">{data.profiles.map(p=><details key={p.id} open={p===data.profiles[0]} className="rounded-lg border border-[var(--color-luxe-border)] p-3"><summary className="cursor-pointer">Version {p.version} · {p.status}</summary><dl className="my-3 space-y-3 text-sm">{Object.entries(p.profile).map(([key,value])=><div key={key}><dt className="font-semibold capitalize">{key.replaceAll('_',' ')}</dt><dd className="mt-1 whitespace-pre-wrap">{Array.isArray(value)?value.join('\n'):value}</dd></div>)}</dl>{p.status==='DRAFT'&&<Button disabled={busy} onClick={()=>act(()=>apiClient.post(`${base}/approve`,{id:p.id}),'Niche profile approved.')}>Approve this profile</Button>}</details>)}</div></Card>}
  <Card><CardHeader><CardTitle>3. Prepare work</CardTitle></CardHeader>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>Research source<select className={field} value={provider} onChange={e=>setProvider(e.target.value)}><option value="sift">Sift</option><option value="apify">Apify</option></select></label>
    <label className={label}>Number of items<input type="number" className={field} value={count} onChange={e=>setCount(Number(e.target.value))} min={1} max={10000}/></label>
   </div>
   {apify.error&&<p role="alert" className="mt-3 text-sm">{apify.error}</p>}
   {provider==='apify'&&!apify.enabled&&<p className="mt-3 text-sm">Apify is not configured yet. Add your saved tasks and API token on the backend.</p>}
   {apify.enabled&&<ApifyTaskSelect catalog={apify} type="prospects" value={prospectScraper} onChange={setProspectScraper} label={provider==='sift'?'Business scraper for Apify fallback':'Apify business scraper'}/>}
   <Button variant="secondary" className="my-3" disabled={busy||!Number.isInteger(count)||count<1||(provider==='apify'&&!canUseApify('prospects',prospectScraper))} onClick={()=>act(()=>queue({kind:'PROSPECT_SEARCH',requested_count:count,research_provider:provider,...selectApify(prospectScraper)}),'Prospect research queued. Results will appear below for review.')}>Find prospects</Button>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className={label}>Draft type<select className={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="EMAIL_GENERATION">Email</option><option value="SEO_GENERATION">SEO article</option><option value="LEAD_MAGNET_GENERATION">Comment on a source post</option></select></label>
    <label className={label}>Assign to<select className={field} value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Choose employee</option>{data.employees.map(e=><option key={e.id} value={e.id}>{e.full_name||e.email}</option>)}</select></label>
   </div>
   {kind==='SEO_GENERATION'&&<label className={`${label} mt-3`}>Approved publishing platforms, one per line<textarea className={field} value={platforms} onChange={e=>setPlatforms(e.target.value)}/></label>}
   <label className={`${label} mt-3`}>Messaging instructions, one per line<textarea className={field} value={constraints} onChange={e=>setConstraints(e.target.value)} placeholder="For example: do not claim guaranteed results"/></label>
   {kind==='LEAD_MAGNET_GENERATION'&&<div className="mt-3 space-y-3"><p className="text-sm">Supply one real post below, or leave both URL and text empty to use the configured research source. A supplied post produces one task.</p><label className={label}>Post URL<input type="url" className={field} value={postUrl} onChange={e=>setPostUrl(e.target.value)}/></label><label className={label}>Original post text<textarea className={field} value={postText} onChange={e=>setPostText(e.target.value)}/></label><label className={label}>Platform<input className={field} value={postPlatform} onChange={e=>setPostPlatform(e.target.value)}/></label><label className={label}>Author, if known<input className={field} value={author} onChange={e=>setAuthor(e.target.value)}/></label></div>}
   {kind==='LEAD_MAGNET_GENERATION'&&!postUrl.trim()&&!postText.trim()&&apify.enabled&&<ApifyTaskSelect catalog={apify} type="opportunities" value={postScraper} onChange={setPostScraper} label={provider==='sift'?'Post scraper for Apify fallback':'Apify post scraper'}/>}
   <Button className="mt-3" disabled={busy||!employee||!Number.isInteger(count)||count<1} onClick={()=>act(async()=>{
    const hasPost=kind==='LEAD_MAGNET_GENERATION'&&!!(postUrl.trim()||postText.trim());
    if(hasPost&&(!postUrl.trim()||!postText.trim()||!postPlatform.trim()))throw new Error('Supply the post URL, original text and platform together.');
    if(kind==='LEAD_MAGNET_GENERATION'&&!hasPost&&provider==='apify'&&!canUseApify('opportunities',postScraper))throw new Error('Choose a configured post scraper first.');
    await queue({...(kind==='LEAD_MAGNET_GENERATION'&&!hasPost?selectApify(postScraper):{}),kind,employee_id:employee,requested_count:hasPost?1:count,research_provider:provider,approved_platforms:platforms.split('\n').map(s=>s.trim()).filter(Boolean),messaging_constraints:constraints.split('\n').map(s=>s.trim()).filter(Boolean),...(hasPost?{opportunities:[{post_url:postUrl.trim(),post_text:postText.trim(),platform:postPlatform.trim(),author:author.trim()||null}]}:{})});
   },'Draft preparation queued. Completed drafts will appear as assigned tasks.')}>Prepare assigned drafts</Button>
   <p className="mt-2 text-xs">Email generation uses qualified prospects without an existing draft. Queue limits use the employee’s existing daily and weekly workload targets, open tasks and pending AI work.</p>
  </Card>
  <Card><CardHeader><CardTitle>Research candidates</CardTitle></CardHeader><p className="mb-3 text-sm">Import only after checking the contact. If an email already exists anywhere in the database, its existing prospect and campaign are preserved.</p>
   <div className="space-y-3">{data.candidates.map(c=><CandidateCard key={c.id} candidate={c} busy={busy} submit={(email,status)=>act(async()=>{const r=await apiClient.post<{disposition:string}>(`/ai/candidates/${c.id}/import`,{email,status});if(r.disposition==='EXISTING')return 'This email already exists. The existing prospect was linked without changing its campaign.';},'Candidate reviewed.')}/>)}</div>
   {!data.candidates.length&&<p className="text-sm">No research candidates yet.</p>}
   <div className="mt-3 flex gap-2"><Button variant="ghost" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</Button><span className="p-2 text-sm">Page {offset/50+1}</span><Button variant="ghost" disabled={!data.has_more} onClick={()=>setOffset(offset+50)}>Next</Button></div>
  </Card>
  <Card><CardHeader><CardTitle>Recent jobs</CardTitle></CardHeader><p className="mb-3 text-xs">Research counts mean staged candidates; generation counts mean assigned drafts. Cancel stops remaining local work, preserves prepared drafts, and does not stop an already running provider request.</p>
   <div className="space-y-3">{data.jobs.map(j=><div key={j.id} className="rounded-lg border border-[var(--color-luxe-border)] p-3 text-sm"><p className="font-semibold">{j.kind.replaceAll('_',' ')} · {j.status}</p><p>{j.delivered_count} / {j.requested_count} prepared · {j.research_provider}</p>{j.apify_connector&&<p className="text-xs">Apify scraper: {j.apify_connector.label}</p>}{j.external_job_id&&<p className="break-all text-xs">Provider run: {j.external_job_id}</p>}{j.error&&<p className="mt-2" role="alert">{j.error}</p>}
    <div className="mt-2 flex flex-wrap gap-2">{j.status==='FAILED'&&j.error_code!=='RESEARCH_RECONCILIATION_REQUIRED'&&j.error_code!=='SIFT_START_UNCERTAIN'&&<><Button size="sm" disabled={busy} onClick={()=>act(()=>apiClient.post(`/ai/jobs/${j.id}/retry`,{}),'Job retried.')}>Retry</Button>{['PROSPECT_SEARCH','LEAD_MAGNET_GENERATION'].includes(j.kind)&&<ApifyRetry catalog={apify} kind={j.kind==='PROSPECT_SEARCH'?'prospects':'opportunities'} busy={busy} submit={id=>act(()=>apiClient.post(`/ai/jobs/${j.id}/retry`,{research_provider:'apify',apify_connector:id}),'Job retried with the selected Apify scraper.')}/>}</>}{!['COMPLETED','CANCELLED'].includes(j.status)&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(()=>apiClient.post(`/ai/jobs/${j.id}/cancel`),'Remaining work cancelled. Prepared drafts remain available.')}>Cancel remaining</Button>}</div>
    {j.status==='FAILED'&&admin&&<details className="mt-3"><summary>Recover uncertain provider launch</summary><form className="mt-2 space-y-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),run=String(f.get('run_id')??'').trim();void act(async()=>{if(!run&&!f.get('not_started'))throw new Error('Provide the existing run ID or verify with the provider that no run started.');await apiClient.post(`/ai/jobs/${j.id}/recover`,run?{run_id:run}:{confirmed_not_started:true});},'Recovery saved. Retry the same job to continue.');}}><label className={label}>Existing provider run ID<input name="run_id" className={field}/></label><label className="flex gap-2"><input name="not_started" type="checkbox"/>I checked with the provider and confirmed no run started.</label><Button type="submit" size="sm" disabled={busy}>Save recovery</Button></form></details>}
   </div>)}</div>{!data.jobs.length&&<p>No jobs yet.</p>}
  </Card>
 </div>;
}
function CandidateCard({candidate:c,busy,submit}:{candidate:Candidate;busy:boolean;submit:(email:string,status:string)=>Promise<void>}) {
 const [email,setEmail]=useState(c.record.email??''),[status,setStatus]=useState('SEED');const url=safeUrl(c.record.source_url??c.record.website);
 return <div className="rounded-lg border border-[var(--color-luxe-border)] p-3 text-sm"><p className="font-semibold">{c.record.organisation}</p><p>{c.record.contact_name||'Contact name not supplied'}</p><p className="mt-1">AI suggestion: {c.qualification.status} — {c.qualification.reason}</p>{url&&<a href={url} target="_blank" rel="noopener noreferrer" className="underline">Check source</a>}{c.disposition==='NEW'?<form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void submit(email,status);}}><label className={label}>Verified email<input className={field} type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className={label}>Your review<select className={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="SEED">Seed — follow up later</option><option value="QUALIFIED">Qualified — ready for drafts</option></select></label><Button type="submit" disabled={busy} className="self-end">Import prospect</Button></form>:<p className="mt-2">{c.disposition==='EXISTING'?'Existing prospect linked; original record preserved.':'Imported into campaign prospects.'}</p>}</div>;
}

function ApifyTaskSelect({catalog,type,value,onChange,label:caption}:{catalog:ApifyCatalog;type:"prospects"|"opportunities";value:string;onChange:(value:string)=>void;label:string}) {
 const choices=catalog.connectors.filter(c=>c.kind===type),defaultChoice=choices.find(c=>c.id===catalog.defaults[type]);
 return <label className={`${label} mt-3`}>{caption}<select className={field} value={value} onChange={e=>onChange(e.target.value)}>
  <option value="">{defaultChoice?`Default: ${defaultChoice.label}`:'Choose a configured scraper'}</option>
  {value&&!choices.some(c=>c.id===value)&&<option value={value} disabled>Previously selected scraper is unavailable</option>}
  {choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
 </select>{!choices.length&&<span className="text-xs">No scraper configured for this research type.</span>}<span className="text-xs">One scraper runs per request. Sift uses this choice only when Apify fallback is enabled.</span></label>;
}
function ApifyRetry({catalog,kind,busy,submit}:{catalog:ApifyCatalog;kind:"prospects"|"opportunities";busy:boolean;submit:(id:string)=>Promise<void>}) {
 const [selected,setSelected]=useState(''),choices=catalog.connectors.filter(c=>c.kind===kind),id=selected||catalog.defaults[kind]||'';
 if(!catalog.enabled||!choices.length)return null;
 return <div className="flex flex-wrap items-center gap-2"><select aria-label="Scraper for retry" className={field} value={selected} onChange={e=>setSelected(e.target.value)}>
  <option value="">{catalog.defaults[kind]?'Use default Apify scraper':'Choose Apify scraper'}</option>{choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
 </select><Button size="sm" variant="secondary" disabled={busy||!choices.some(c=>c.id===id)} onClick={()=>submit(id)}>Retry with Apify</Button></div>;
}
