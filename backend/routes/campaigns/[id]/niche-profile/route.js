import { route } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { scopedCampaign } from '../../../../ai/jobs.js';
export const GET=route({roles:['ADMIN','MANAGER']},async ({session,params})=>{
  await scopedCampaign(session,params.id);
  const {rows}=await query('select * from niche_profiles where campaign_id=$1 order by version desc',[params.id]);
  return {data:rows};
});
