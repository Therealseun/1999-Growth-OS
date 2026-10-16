import { apifyConnectorId } from './apify-config.js';
import { z } from 'zod';

const text = z.string().trim().min(1);
const list = z.array(text);
const nullable = text.nullable();
export const webUrl = z.string().url().refine(v => ['http:', 'https:'].includes(new URL(v).protocol), 'HTTP(S) URL required');
export const nicheSchema = z.object({
  industry: text, market: text, organisation_types: list, audiences: list,
  decision_makers: list, job_titles: list, geographic_segments: list,
  pain_points: list, buying_motivations: list, keywords: list, search_queries: list,
  platforms: list, prospect_strategy: text, outreach_angles: list, seo_angles: list,
  lead_magnet_topics: list, exclusions: list, assumptions: list,
}).strict();
export const emailSchema = z.object({ subject: text.max(300), body: text.max(30000), cta: text }).strict();
export const seoPlanSchema = z.object({ topic: text, primary_keyword: text, secondary_keywords: list,
  search_intent: text, target_audience: text, title: text, platform: text }).strict();
export const articleSchema = z.object({ article: text.min(300).max(100000), meta_title: text.max(200),
  meta_description: text.max(500), cta: text }).strict();
export const commentSchema = z.object({ relevance_reason: text, comment: text.max(10000) }).strict();
export const qualificationSchema = z.object({
  status: z.enum(['QUALIFIED','REJECTED','NEEDS_REVIEW']), reason: text,
}).strict();
export const prospectSchema = z.object({
  research_provider: z.enum(['sift','apify']), provider_record_id: text,
  organisation: text, contact_name: nullable, email: z.string().email().nullable(),
  website: webUrl.nullable(), industry: nullable, location: nullable, source_url: webUrl.nullable(),
  phone: nullable.optional().default(null),
  source_metadata: z.record(z.unknown()).optional().default({}),
}).strict();
export const opportunitySchema = z.object({
  platform: text, author: nullable, post_url: webUrl, post_text: text.max(30000),
}).strict();

// One definition powers both strict provider JSON schemas and local validation.
// Only the types used above are supported; adding a new type fails loudly.
export function jsonSchema(s) {
  const d = s._def;
  switch (d.typeName) {
    case 'ZodObject': return { type:'object', properties: Object.fromEntries(Object.entries(s.shape).map(([k,v]) => [k,jsonSchema(v)])), required:Object.keys(s.shape), additionalProperties:false };
    case 'ZodArray': return { type:'array', items:jsonSchema(d.type) };
    case 'ZodNullable': return { anyOf:[jsonSchema(d.innerType),{type:'null'}] };
    case 'ZodString': return {type:'string'};
    case 'ZodEnum': return {type:'string',enum:d.values};
    case 'ZodEffects': return jsonSchema(d.schema);
    default: throw new Error(`Unsupported schema type ${d.typeName}`);
  }
}

export const jobRequestSchema = z.object({
  kind: z.enum(['NICHE_ANALYSIS','PROSPECT_SEARCH','EMAIL_GENERATION','SEO_GENERATION','LEAD_MAGNET_GENERATION']),
  idempotency_key: text.max(160), workload_id:z.string().uuid().optional(),
  requested_count:z.number().int().positive().optional(),
  research_provider:z.enum(['sift','apify']).optional(),apify_connector:apifyConnectorId.optional(),
  messaging_constraints:z.array(text.max(2000)).max(50).default([]),
  approved_platforms:z.array(text.max(200)).max(50).default([]),
  opportunities:z.array(opportunitySchema).max(10000).optional(),
}).strict();
