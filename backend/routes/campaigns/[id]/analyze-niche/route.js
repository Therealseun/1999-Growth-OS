import { route, accepted } from '../../../../lib/http.js';
import { jobRequestSchema } from '../../../../ai/contracts.js';
import { enqueue } from '../../../../ai/jobs.js';
export const POST=route({roles:['ADMIN','MANAGER'],body:jobRequestSchema.omit({kind:true})},async ({session,params,body})=>accepted({data:await enqueue(session,params.id,{...body,kind:'NICHE_ANALYSIS'})}));
