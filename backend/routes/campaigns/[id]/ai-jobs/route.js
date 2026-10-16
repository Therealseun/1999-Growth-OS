import { route, accepted } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { jobRequestSchema } from '../../../../ai/contracts.js';
import { enqueue, scopedCampaign, publicJob } from '../../../../ai/jobs.js';
export const POST = route({roles:['ADMIN','MANAGER'],body:jobRequestSchema}, async ({session,params,body}) => accepted({data:await enqueue(session,params.id,body)}));
export const GET = route({roles:['ADMIN','MANAGER']},async ({session,params}) => {
  await scopedCampaign(session,params.id);
  const {rows}=await query('select * from integration_jobs where campaign_id=$1 order by requested_at desc limit 100',[params.id]);
  return {data:rows.map(publicJob)};
});
