import { route } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { scopedCampaign,publicJob } from '../../../../ai/jobs.js';
import { z } from 'zod';
export const GET=route({roles:['ADMIN','MANAGER'],params:z.object({id:z.string().uuid()})},async({session,params})=>{
  const campaign=await scopedCampaign(session,params.id);
  const {rows:profiles}=await query('select * from niche_profiles where campaign_id=$1 order by version desc',[campaign.id]);
  const {rows:jobs}=await query('select * from integration_jobs where campaign_id=$1 order by requested_at desc limit 100',[campaign.id]);
  const {rows:[counts]}=await query(`select count(*)::int as prospects,count(*) filter(where qualification_status='QUALIFIED' and email is not null)::int as qualified from prospects where campaign_id=$1`,[campaign.id]);
  return {data:{campaign,profiles,jobs:jobs.map(publicJob),counts}};
});
