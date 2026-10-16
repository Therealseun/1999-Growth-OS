import { apifyConnectorId } from '../../../../ai/apify-config.js';
import { z } from 'zod';
import { route, accepted } from '../../../../lib/http.js';
import { retryJob } from '../../../../ai/jobs.js';
import { opportunitySchema } from '../../../../ai/contracts.js';
export const POST=route({roles:['ADMIN','MANAGER'],body:z.object({
  research_provider:z.enum(['sift','apify']).optional(),apify_connector:apifyConnectorId.optional(),opportunities:z.array(opportunitySchema).max(10000).optional()
}).strict().default({})},async ({session,params,body})=>accepted({data:await retryJob(session,params.id,body)}));
