import { z } from 'zod';
import { route } from '../../../../../lib/http.js';
import { withTransaction } from '../../../../../lib/db.js';
import { scopedCampaign } from '../../../../../ai/jobs.js';
import { nicheSchema } from '../../../../../ai/contracts.js';
import { notFound } from '../../../../../lib/errors.js';
export const POST=route({roles:['ADMIN','MANAGER'],body:z.object({profile_id:z.string().uuid()}).strict()},async ({session,params,body})=>
  withTransaction(session.userId,async db=>{
    await scopedCampaign(session,params.id,db);
    await db.query('select id from campaigns where id=$1 for update',[params.id]);
    const {rows:[profile]}=await db.query('select * from niche_profiles where id=$1 and campaign_id=$2',[body.profile_id,params.id]);
    if (!profile) throw notFound();
    nicheSchema.parse(profile.profile);
    await db.query("update niche_profiles set status='SUPERSEDED' where campaign_id=$1 and status='APPROVED' and id<>$2",[params.id,profile.id]);
    const {rows}=await db.query("update niche_profiles set status='APPROVED',approved_by=$2,approved_at=now() where id=$1 returning *",[profile.id,session.userId]);
    return {data:rows[0]};
  }));
