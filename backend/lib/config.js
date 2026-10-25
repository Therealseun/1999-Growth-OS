import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envFile)) {
  const fileConfig = parseEnv(readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(fileConfig)) {
    if ((process.env[key] === undefined || process.env[key] === '') && value !== '') {
      process.env[key] = value;
    }
  }
}

// Empty strings in .env files count as "not set".
const schema = z.object({
  GROWTHOS_SCHEMA: z.enum(['foundation', 'shared']).default('foundation'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['verify', 'no-verify', 'off']).default('verify'),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  EVIDENCE_BUCKET: z.string().trim().min(1).default('evidence'),
  SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().trim().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  MANAGER_EMAIL: z.string().trim().optional(),
  MANAGER_PASSWORD: z.string().optional(),
  MANAGER_DEPARTMENT_ID: z.string().optional(),
  FRONTEND_URL: z.string().trim().url().default('https://1999-growth-os.vercel.app'),
  CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().optional(),
}).superRefine((config, context) => {
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.ADMIN_EMAIL && !z.string().email().safeParse(config.ADMIN_EMAIL).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_EMAIL'],
      message: 'must be a valid email address',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.ADMIN_PASSWORD
      && (config.ADMIN_PASSWORD.length < 8 || config.ADMIN_PASSWORD.length > 72)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_PASSWORD'],
      message: 'must be between 8 and 72 characters',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared'
      && Boolean(config.ADMIN_EMAIL) !== Boolean(config.ADMIN_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_EMAIL'],
      message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set together',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.MANAGER_EMAIL
      && !z.string().email().safeParse(config.MANAGER_EMAIL).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_EMAIL'],
      message: 'must be a valid email address',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.MANAGER_PASSWORD
      && (config.MANAGER_PASSWORD.length < 8 || config.MANAGER_PASSWORD.length > 72)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_PASSWORD'],
      message: 'must be between 8 and 72 characters',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared'
      && Boolean(config.MANAGER_EMAIL) !== Boolean(config.MANAGER_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_EMAIL'],
      message: 'MANAGER_EMAIL and MANAGER_PASSWORD must be set together',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.MANAGER_DEPARTMENT_ID
      && !z.string().uuid().safeParse(config.MANAGER_DEPARTMENT_ID).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_DEPARTMENT_ID'],
      message: 'must be a valid department UUID',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared'
      && Boolean(config.MANAGER_EMAIL) !== Boolean(config.MANAGER_DEPARTMENT_ID)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_DEPARTMENT_ID'],
      message: 'must be set together with MANAGER_EMAIL',
    });
  }
  if (config.GROWTHOS_SCHEMA !== 'shared' && config.ADMIN_EMAIL && config.MANAGER_EMAIL
      && config.ADMIN_EMAIL.toLowerCase() === config.MANAGER_EMAIL.toLowerCase()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MANAGER_EMAIL'],
      message: 'must differ from ADMIN_EMAIL',
    });
  }
});

let cached;

export function getConfig() {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

export function resetConfigForTests() {
  cached = undefined;
}
