import { route } from '../../../../lib/http.js';
import { withTransaction } from '../../../../lib/db.js';
import { scopedCampaign } from '../../../../ai/jobs.js';
import { qualificationSchema } from '../../../../ai/contracts.js';
import { notFound, invalid } from '../../../../lib/errors.js';
export const PATCH=route({roles:['ADMIN','MANAGER'],body:qualificationSchema},async ({session,params,body})=>
  withTransaction(session.userId,async db=>{
    const {rows:[prospect]}=await db.query('select * from prospects where id=$1 for update',[params.id]);
    if (!prospect) throw notFound();
    await scopedCampaign(session,prospect.campaign_id,db);
    if (body.status==='QUALIFIED' && !prospect.email) throw invalid('A usable email is required for email qualification.');
    const {rows}=await db.query('update prospects set qualification_status=$2,qualification_reason=$3 where id=$1 returning *',[params.id,body.status,body.reason]);
    return {data:rows[0]};
  }));
