import { z } from 'zod';

// Empty strings in .env files count as "not set".
const schema = z.object({
  GROWTHOS_SCHEMA: z.enum(['shared', 'foundation']).default('shared'),
  AI_WORKER_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['verify', 'no-verify', 'off']).default('verify'),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().optional(),
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
