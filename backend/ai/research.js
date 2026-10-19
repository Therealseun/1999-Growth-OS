import { createHash } from 'node:crypto';
import { WorkError } from './config.js';
import { prospectSchema, opportunitySchema, webUrl } from './contracts.js';
import { SiftProvider } from './sift.js';
import { selectApifyConnector, validateApifySelection } from './apify-config.js';
export { SiftProvider } from './sift.js';

const str = v => typeof v === 'string' && v.trim() ? v.trim() : null;
const pathValue = (obj, path) => typeof path === 'string' ? path.split('.').reduce((o,k) => o?.[k],obj) : null;
export function canonicalUrl(value) {
  const checked = webUrl.safeParse(value);
  if (!checked.success) return null;
  const u = new URL(value); u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
  return u.toString();
}

export function normalizeRows(rows, kind, mapping, provider = 'apify', constants = {}) {
  const records = [], seen = new Set(); let invalid = 0, duplicates = 0;
  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(mapping).map(([key,path]) => {
      const value=pathValue(raw,path);
      return [key,key === 'provider_record_id' && Number.isSafeInteger(value) ? String(value) : str(value)];
    }));
    if(kind==='opportunities' && constants.platform)row.platform=constants.platform;
    let record;
    if (kind === 'prospects') {
      const email = row.email?.toLowerCase() ?? null;
      const candidate = {
        research_provider:provider, provider_record_id:row.provider_record_id ?? createHash('sha256')
          .update(JSON.stringify([email, row.organisation, row.location, row.website, row.source_url])).digest('hex'),
        organisation:row.organisation, contact_name:row.contact_name ?? null,
        email:email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
        website:canonicalUrl(row.website),industry:row.industry ?? null,
        location:row.location ?? null,source_url:canonicalUrl(row.source_url),phone:row.phone ?? null,
      };
      record = prospectSchema.safeParse(candidate);
    } else {
      record = opportunitySchema.safeParse({platform:row.platform,author:row.author ?? null,
        post_url:canonicalUrl(row.post_url),post_text:row.post_text});
    }
    if (!record.success) { invalid++; continue; }
    const value = record.data;
    const key = kind === 'prospects' ? value.email ?? `${provider}:${value.provider_record_id}` : value.post_url;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); records.push(value);
  }
  return {records,invalid,duplicates};
}

// Exact token replacements preserve array/number types in Actor-specific input templates.
export function renderInput(template, context) {
  if (Array.isArray(template)) return template.map(v => renderInput(v,context));
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([k,v]) => [k,renderInput(v,context)]));
  if (typeof template === 'string' && /^\{\{[a-z_]+\}\}$/.test(template)) {
    const key = template.slice(2,-2);
    if (!(key in context)) throw new WorkError('APIFY_CONFIG_INVALID',`Unknown Apify input token: ${key}`);
    return context[key];
  }
  return template;
}

export class ApifyProvider {
  constructor(cfg, settings, fetchImpl = fetch, selection = null) { this.cfg=cfg; this.settings=settings; this.fetch=fetchImpl; this.selection=selection; }
  validate(kind) {
    if (!this.cfg.APIFY_ENABLED) throw new WorkError('APIFY_DISABLED','Apify is disabled. Configure and enable it before use.');
    return this.selection && typeof this.selection==='object'
      ? validateApifySelection(this.selection,kind)
      : selectApifyConnector(this.settings,kind,this.selection??undefined);
  }
  snapshot(kind) { return structuredClone(this.validate(kind)); }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetch(`https://api.apify.com/v2/${path}`,{
        ...options,redirect:'error',headers:{Authorization:`Bearer ${this.cfg.APIFY_TOKEN}`,'Content-Type':'application/json'},
        signal:AbortSignal.timeout(30000),
      });
    } catch { throw new WorkError(options.method === 'POST' ? 'APIFY_START_UNCERTAIN' : 'APIFY_UNAVAILABLE',
      'Apify request failed or timed out.',options.method !== 'POST'); }
    if (!response.ok) throw new WorkError(options.method === 'POST' ? 'APIFY_START_UNCERTAIN' : 'APIFY_HTTP_ERROR',
      `Apify returned HTTP ${response.status}.`,options.method !== 'POST' && (response.status === 429 || response.status >= 500));
    try { return await response.json(); }
    catch { throw new WorkError(options.method === 'POST' ? 'APIFY_START_UNCERTAIN' : 'APIFY_INVALID_RESPONSE','Apify returned invalid JSON.',false); }
  }
  input(kind, context) { return renderInput(this.validate(kind).input,context); }
  async start(kind, context) {
    const s = this.validate(kind);
    const q = new URLSearchParams({timeout:String(Math.min(this.cfg.APIFY_TIMEOUT_SECONDS??300,s.timeout_seconds??3600)),restartOnError:'false',
      maxTotalChargeUsd:String(Math.min(this.cfg.APIFY_MAX_CHARGE_USD??0,s.max_charge_usd??Infinity))});
    if (Number.isInteger(context.count) && context.count > 0) q.set('maxItems',String(context.count));
    const {data} = await this.request(`actor-tasks/${encodeURIComponent(s.task_id)}/runs?${q}`,{
      method:'POST',body:JSON.stringify(this.input(kind,context)),
    });
    if (!data?.id) throw new WorkError('APIFY_START_UNCERTAIN','Apify did not return a run ID. Reconcile the run in Apify before retrying.');
    return {id:data.id};
  }
  async poll(id) {
    const {data} = await this.request(`actor-runs/${encodeURIComponent(id)}`);
    if (!data?.status) throw new WorkError('APIFY_INVALID_RESPONSE','Missing Apify run status.');
    if (['FAILED','ABORTED','TIMED-OUT'].includes(data.status)) throw new WorkError('RESEARCH_FAILED',`Apify run ended with ${data.status}.`);
    if (data.status !== 'SUCCEEDED') return {done:false};
    if (!data.defaultDatasetId) throw new WorkError('APIFY_INVALID_RESPONSE','Successful run has no dataset.');
    return {done:true,dataset_id:data.defaultDatasetId};
  }
  async results(kind, datasetId, offset = 0, limit = 100) {
    const q = new URLSearchParams({format:'json',clean:'true',offset:String(offset),limit:String(limit)});
    const rows = await this.request(`datasets/${encodeURIComponent(datasetId)}/items?${q}`);
    if (!Array.isArray(rows)) throw new WorkError('APIFY_INVALID_RESPONSE','Expected dataset rows.');
    const s=this.validate(kind);
    let invalid=0;
    const mapped=s.results_path?rows.flatMap(row=>{
      const items=pathValue(row,s.results_path);
      if(!Array.isArray(items)){invalid++;return [];}
      return items;
    }):rows;
    const result=normalizeRows(mapped,kind,s.fields,'apify',s.constants);
    result.invalid+=invalid;
    if(kind==='prospects')for(const record of result.records){
      const originalId=record.provider_record_id;
      // Separate task ID spaces, while retaining old IDs for the original configuration.
      if(!s.legacy)record.provider_record_id=`${s.id}:${s.task_id}:${originalId}`;
      record.source_metadata={...record.source_metadata,apify_connector:s.id,apify_task_id:s.task_id,apify_dataset_id:datasetId,apify_record_id:originalId};
    }
    return {...result,read:rows.length,done:rows.length < limit};
  }
}

export function researchProvider(name, cfg, settings, fetchImpl, selection) {
  if (name === 'sift') return new SiftProvider(cfg,fetchImpl);
  if (name === 'apify') return new ApifyProvider(cfg,settings,fetchImpl,selection);
  throw new WorkError('UNKNOWN_PROVIDER','Unsupported research provider.');
}
