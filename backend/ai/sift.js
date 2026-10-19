import { WorkError } from './config.js';
import { normalizeRows, canonicalUrl } from './research.js';

const clean = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const idPath = id => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new WorkError('SIFT_INVALID_RESPONSE','Sift returned an invalid job ID.');
  return `/api/discover/jobs/${encodeURIComponent(id)}`;
};

export function siftQueries(profile) {
  return [...new Set((profile.search_queries ?? []).map(clean).filter(Boolean))];
}

export function normalizeSiftRows(rows, jobId) {
  const enriched=rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const metadata=raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const osmId=clean(raw.osmId) ?? clean(metadata.osm_id) ?? clean(metadata.osmId);
    const osmUrl=osmId && /^(node|way|relation)\/\d+$/.test(osmId) ? `https://www.openstreetmap.org/${osmId}` : null;
    const id=Number.isSafeInteger(raw.id) ? String(raw.id) : clean(raw.id);
    return {...raw, _id:id, _source:canonicalUrl(raw.source_url) ?? canonicalUrl(metadata.source_url) ?? osmUrl,
      _metadata:{sift_job_id:jobId,sift_result_id:id,source:clean(raw.source),osm_id:osmId,
        contact_page_url:canonicalUrl(metadata.contact_page_url),fetched_at:raw.created_at ?? null},
      _name:clean(raw.business_name) ?? clean(raw.businessName)};
  });
  const result=normalizeRows(enriched,'prospects',{organisation:'_name',provider_record_id:'_id',email:'email',
    phone:'phone',website:'website',location:'address',source_url:'_source'},'sift');
  // The API's numeric result ID is converted to text before normalisation.
  // Old responses without IDs still get the stable content hash used by other providers.
  for (const record of result.records) {
    const raw=enriched.find(r => r._id === record.provider_record_id || (!r._id && r._name === record.organisation && (clean(r.email)?.toLowerCase() ?? null) === record.email));
    record.source_metadata=raw?._metadata ?? {sift_job_id:jobId};
  }
  return result;
}

export class SiftProvider {
  constructor(cfg = {}, fetchImpl = fetch) { this.cfg=cfg; this.fetch=fetchImpl; this.name='sift'; }
  validate(kind = 'prospects') {
    if (!this.cfg.SIFT_ENABLED) throw new WorkError('SIFT_NOT_CONFIGURED','Enable and configure the Sift connection before use.');
    if (!this.cfg.SIFT_BASE_URL || !this.cfg.SIFT_API_KEY || !this.cfg.SIFT_OWNER_EMAIL) throw new WorkError('SIFT_NOT_CONFIGURED','Sift URL, account token and account email are required.');
    if (this.cfg.SIFT_EXECUTION_MODE === 'start' && (this.cfg.SIFT_AUTH_HEADER ?? 'Authorization') !== 'Authorization') throw new WorkError('SIFT_NOT_CONFIGURED','The current Sift API requires SIFT_AUTH_HEADER=Authorization and a valid Sift account token.');
    if (kind !== 'prospects') throw new WorkError('SIFT_UNSUPPORTED_CAPABILITY','This Sift API discovers businesses, not social posts. Use reviewed posts or configured Apify research.');
  }
  input(kind, context) {
    this.validate(kind);
    const query=clean(context.queries?.[context.query_index ?? 0]);
    const region=clean(context.market);
    if (!query || !region) throw new WorkError('SIFT_INPUT_INVALID','An approved search query and explicit campaign location are required.');
    return {query,filters:{region,requireEmail:true},requestedVolume:Math.min(context.count,this.cfg.SIFT_BATCH_SIZE ?? 100),ownerEmail:this.cfg.SIFT_OWNER_EMAIL};
  }
  async request(path, {method='GET',body,create=false,execute=false,idempotencyKey} = {}) {
    const c=this.cfg, header=c.SIFT_AUTH_HEADER ?? 'Authorization';
    let response;
    const uncertain=()=>new WorkError(create?'SIFT_START_UNCERTAIN':execute?'SIFT_EXECUTION_UNCERTAIN':'SIFT_UNAVAILABLE',
      create?'Sift launch outcome is unknown. Reconcile the job before retrying.':execute?'Sift execution outcome is unknown. Poll the existing job.':'Sift request failed or timed out.',!create && !execute);
    try {
      response=await this.fetch(`${c.SIFT_BASE_URL.replace(/\/$/,'')}${path}`,{method,redirect:'error',
        headers:{Accept:'application/json','Content-Type':'application/json',
          [header]:header === 'Authorization' ? `Bearer ${c.SIFT_API_KEY}` : c.SIFT_API_KEY,
          ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(c.SIFT_TIMEOUT_MS ?? 30000)});
    } catch { throw uncertain(); }
    if (!response.ok) {
      // Only this documented busy response proves /start was not dispatched.
      // A timeout, generic 5xx or malformed body still has an uncertain outcome.
      if (execute && path.endsWith('/start') && response.status === 503) {
        const data=await response.json().catch(()=>null);
        if (data?.error === 'busy') throw new WorkError('SIFT_BUSY','Sift has no available worker. Retry this job shortly.',true);
        throw uncertain();
      }
      if ((create || execute) && (response.status >= 500 || response.status === 408)) throw uncertain();
      if (response.status === 401 || response.status === 403) throw new WorkError('SIFT_ACCESS_DENIED','Sift rejected the account token. Sign in to Sift and obtain a fresh token; check that both Sift services use the same signing secret.');
      if (response.status === 402) throw new WorkError('SIFT_ACCESS_REQUIRED','This Sift account needs an active Pro/Enterprise plan or a live free access window.');
      if (create && response.status === 409) throw new WorkError('SIFT_ACCOUNT_BUSY','This Sift account already has an active search. Wait for it to finish or cancel it in Sift, then retry this GrowthOS job.');
      if (response.status >= 400 && response.status < 500 && ![404,429].includes(response.status)) throw new WorkError('SIFT_REQUEST_REJECTED',`Sift rejected the request (HTTP ${response.status}). Check the agreed API inputs.`);
      const error=new WorkError(response.status === 429 ? 'SIFT_RATE_LIMITED':'SIFT_HTTP_ERROR',`Sift returned HTTP ${response.status}.`,response.status === 429 || response.status >= 500);
      const retry=Number(response.headers.get('retry-after'));
      if (Number.isFinite(retry) && retry>0) error.retryAfterMs=Math.min(retry*1000,3600000);
      throw error;
    }
    try {
      const data=await response.json();
      if (!data || typeof data !== 'object' || data.ok === false) throw new Error('Unexpected response');
      return data;
    } catch {
      if (create || execute) throw uncertain();
      throw new WorkError('SIFT_INVALID_RESPONSE','Sift returned an invalid JSON response.');
    }
  }
  async start(kind, context) {
    const data=await this.request('/api/discover/jobs',{method:'POST',body:this.input(kind,context),create:true,idempotencyKey:context.idempotency_key});
    const id=data.jobId ?? data.job?.id;
    try { idPath(id); } catch { throw new WorkError('SIFT_START_UNCERTAIN','Sift did not return a usable job ID. Reconcile the launch.'); }
    return {id};
  }
  async prepare(id, mode = this.cfg.SIFT_EXECUTION_MODE ?? 'explicit') {
    if (mode === 'start') return; // The Sift background runner prepares its own plan.
    await this.request('/api/discover/rephrase',{method:'POST',body:{jobId:id}});
  }
  async execute(id, count, mode = this.cfg.SIFT_EXECUTION_MODE ?? 'explicit') {
    if (mode === 'start') return this.request(`${idPath(id)}/start`,{method:'POST',execute:true,body:{}});
    return this.request(`${idPath(id)}/run-resolve`,{method:'POST',execute:true,body:{maxCandidates:Math.min(count,this.cfg.SIFT_BATCH_SIZE ?? 100)}});
  }
  async poll(id, state = {}) {
    const {job}=await this.request(idPath(id));
    if (!job || typeof job.status !== 'string') throw new WorkError('SIFT_INVALID_RESPONSE','Sift response is missing job status.');
    if (job.id && job.id !== id) throw new WorkError('SIFT_INVALID_RESPONSE','Sift returned a different job.');
    const status=job.status.toLowerCase();
    if (['cancelled','canceled'].includes(status)) throw new WorkError('SIFT_CANCELLED','Sift research was cancelled.');
    const expired=state.started_at && Date.now()-state.started_at >= (this.cfg.SIFT_JOB_TIMEOUT_MS ?? 600000);
    const terminal=['completed','exhausted','partial','failed'].includes(status);
    if (!terminal && !['pending','running','queued','processing'].includes(status)) throw new WorkError('SIFT_INVALID_RESPONSE','Unknown Sift job status.');
    const synchronousFinished=(state.execution_mode ?? this.cfg.SIFT_EXECUTION_MODE ?? 'explicit') === 'explicit' && state.execution_finished;
    if (terminal || synchronousFinished || expired) return {done:true,dataset_id:id,
      outcome:terminal?status:expired?'timeout':'exhausted'};
    return {done:false};
  }
  async results(kind, jobId, offset=0, limit=100) {
    this.validate(kind);
    const pageSize=Math.min(limit,500);
    const data=await this.request(`${idPath(jobId)}/results?limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(data.results) || data.results.length>pageSize || !Number.isSafeInteger(data.total) || data.total<0) throw new WorkError('SIFT_INVALID_RESPONSE','Sift results must include a bounded results array and integer total.');
    if (data.results.some(r=>r?.job_id && r.job_id !== jobId)) throw new WorkError('SIFT_INVALID_RESPONSE','Results include a different Sift job.');
    return {...normalizeSiftRows(data.results,jobId),read:data.results.length,done:data.results.length<pageSize || offset+data.results.length>=data.total};
  }
}
