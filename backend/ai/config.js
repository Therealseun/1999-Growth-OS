import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
const schema = z.object({
  AI_ENABLED: flag,
  AI_CHAT_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_JSON_MODE: z.enum(['json_schema', 'json_object']).default('json_schema'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(90000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(6000),
  AI_MAX_ITEMS_PER_JOB: z.coerce.number().int().positive().default(10000),
  AI_QUALIFY_PROSPECTS: flag,
  RESEARCH_PROVIDER: z.enum(['sift','apify']).default('sift'),
  RESEARCH_FALLBACK: z.enum(['none','apify']).default('none'),
  SIFT_ENABLED: flag,
  SIFT_BASE_URL: z.string().url().optional(),
  SIFT_API_KEY: z.string().optional(),
  SIFT_AUTH_HEADER: z.enum(['Authorization','X-Integration-Key','X-API-Key']).default('Authorization'),
  SIFT_OWNER_EMAIL: z.string().email().optional(),
  SIFT_EXECUTION_MODE: z.enum(['explicit','background','start']).default('explicit'),
  SIFT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  SIFT_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3600000).default(600000),
  SIFT_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  SIFT_MAX_JOBS_PER_REQUEST: z.coerce.number().int().min(1).max(20).default(3),
  APIFY_ENABLED: flag,
  APIFY_TOKEN: z.string().optional(),
  APIFY_CONFIG_FILE: z.string().optional(),
  APIFY_MAX_CHARGE_USD: z.coerce.number().nonnegative().default(0),
  APIFY_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
  AI_WORKER_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
});

export function aiConfig(env = process.env) {
  const cfg = schema.parse(Object.fromEntries(Object.entries(env).filter(([,v]) => v !== '')));
  if (cfg.AI_ENABLED && (!cfg.AI_CHAT_URL || !cfg.AI_MODEL)) throw new Error('AI_CHAT_URL and AI_MODEL are required when AI_ENABLED=true');
  if (cfg.APIFY_ENABLED && (!cfg.APIFY_TOKEN || !cfg.APIFY_CONFIG_FILE)) throw new Error('APIFY_TOKEN and APIFY_CONFIG_FILE are required when APIFY_ENABLED=true');
  if (cfg.SIFT_ENABLED && (!cfg.SIFT_BASE_URL || !cfg.SIFT_API_KEY || !cfg.SIFT_OWNER_EMAIL)) throw new Error('SIFT_BASE_URL, SIFT_API_KEY and SIFT_OWNER_EMAIL are required when SIFT_ENABLED=true');
  if (cfg.SIFT_BASE_URL) {
    const u = new URL(cfg.SIFT_BASE_URL);
    if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new Error('SIFT_BASE_URL must be an origin without a path, credentials, query or fragment');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw new Error('SIFT_BASE_URL must use HTTPS except on localhost');
  }
  if (cfg.AI_CHAT_URL) {
    const u = new URL(cfg.AI_CHAT_URL);
    if (u.username || u.password || u.search) throw new Error('AI_CHAT_URL cannot contain credentials or query parameters');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) {
      throw new Error('AI_CHAT_URL must use HTTPS, except for a local model server');
    }
  }
  return cfg;
}

export function apifySettings(cfg) {
  if(!cfg.APIFY_ENABLED||!cfg.APIFY_CONFIG_FILE)return {};
  try{return JSON.parse(readFileSync(resolve(fileURLToPath(new URL('../',import.meta.url)),cfg.APIFY_CONFIG_FILE),'utf8'));}
  catch{throw new WorkError('APIFY_CONFIG_INVALID','Could not read the Apify JSON configuration. Relative APIFY_CONFIG_FILE paths are resolved from the backend folder.');}
}

export class WorkError extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}
