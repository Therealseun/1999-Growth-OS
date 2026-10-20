import { z } from 'zod';
import { notFound } from './errors.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuid = z.string().regex(UUID_RE, 'Must be a uuid');

function isRealDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isRealDate, 'Not a real date');

export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http and https links are allowed');

export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
};

// A malformed id in a path is a missing record, not a server error.
export function idParam(params, name = 'id') {
  const value = params?.[name];
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound();
  return value;
}

// Evidence a person attaches when completing a task. URL links must be http(s). FILE points at an object
// uploaded through /api/evidence/upload-url.
export const evidenceInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('URL'), value: httpUrl }),
  z.object({ type: z.literal('TEXT'), value: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal('FILE'), storage_path: z.string().trim().min(3).max(300) }),
]);

// Text column helper: trims, treats empty as absent, caps the length.
export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
