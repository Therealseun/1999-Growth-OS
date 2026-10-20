import { getConfig } from './config.js';
import { withTransaction } from './db.js';
import { mockDeliver } from './mock-provider.js';

// Outbound calls to the AI and Sift services (see docs/provider-contract.yaml).
// dispatchJob() never throws for a provider problem. It records the outcome on the job and returns it,
// so one broken service cannot stop the rest of the pipeline.

export const PATHS = {
  NICHE_ANALYSIS: '/v1/niche-analysis',
  PROSPECT_SEARCH: '/v1/prospect-search',
  EMAIL_GENERATION: '/v1/email-generation',
  SEO_GENERATION: '/v1/seo-generation',
  LEAD_MAGNET_GENERATION: '/v1/lead-magnet-generation',
};

const ATTEMPTS = 3;
const TIMEOUT_MS = 8000;

let overrides = {}; // tests only
export function setProviderForTests(value) {
  overrides = value ?? {};
}
const doFetch = (...args) => (overrides.fetch ?? fetch)(...args);
const sleep = (ms) => (overrides.sleep ? overrides.sleep(ms) : new Promise((r) => setTimeout(r, ms)));

async function markJob(jobId, fields) {
  return withTransaction(null, async (db) => {
    const { rows } = await db.query(
      `update integration_jobs
          set status = $2::job_status,
              external_job_id = coalesce($3::text, external_job_id),
              error = $4::text,
              attempts = attempts + 1,
              accepted_at = case when $2::job_status = 'ACCEPTED' then now() else accepted_at end,
              completed_at = case when $2::job_status in ('COMPLETED', 'FAILED') then now() else completed_at end
        where id = $1 returning *`,
      [jobId, fields.status, fields.externalJobId ?? null, fields.error ? String(fields.error).slice(0, 500) : null],
    );
    return rows[0];
  });
}

async function callHttp(job, payload) {
  const cfg = getConfig();
  if (!cfg.AI_SERVICE_URL) throw Object.assign(new Error('AI_SERVICE_URL is not set'), { final: true });
  const url = new URL(PATHS[job.kind], cfg.AI_SERVICE_URL).toString();
  const headers = { 'content-type': 'application/json' };
  if (cfg.AI_SERVICE_TOKEN) headers.authorization = `Bearer ${cfg.AI_SERVICE_TOKEN}`;

  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 202 || res.status === 200) {
        const data = await res.json().catch(() => null);
        if (typeof data?.external_job_id !== 'string' || !data.external_job_id) {
          throw Object.assign(new Error('The service answered without an external_job_id'), { final: true });
        }
        return data.external_job_id;
      }
      // The same job_id is sent every time, and the contract makes repeats safe, so retrying is harmless.
      if (res.status === 429 || res.status >= 500) throw new Error(`The service answered ${res.status}`);
      throw Object.assign(new Error(`The service rejected the request (${res.status})`), { final: true });
    } catch (err) {
      lastError = err;
      if (err.final || attempt === ATTEMPTS) break;
      await sleep(400 * 3 ** (attempt - 1));
    }
  }
  throw lastError;
}

export async function dispatchJob(job, payload) {
  const cfg = getConfig();
  try {
    if (cfg.PROVIDER_MODE === 'mock') {
      await markJob(job.id, { status: 'ACCEPTED', externalJobId: `mock-${job.id}` });
      await mockDeliver(job, payload);
      return await markJob(job.id, { status: 'COMPLETED', externalJobId: `mock-${job.id}` });
    }
    const externalId = await callHttp(job, payload);
    return await markJob(job.id, { status: 'ACCEPTED', externalJobId: externalId });
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', message: 'provider request failed', job: job.id, kind: job.kind, error: err.message }));
    return markJob(job.id, { status: 'FAILED', error: err.message });
  }
}
