import { z } from 'zod';
import { route, accepted } from '../../../../lib/http.js';
import { withTransaction } from '../../../../lib/db.js';
import { getJob, publicJob } from '../../../../ai/jobs.js';
import { conflict } from '../../../../lib/errors.js';
// Admin reconciles an uncertain launch against the active provider's job history.
export const POST=route({roles:['ADMIN'],body:z.union([
  z.object({run_id:z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)}).strict(),
  z.object({confirmed_not_started:z.literal(true)}).strict()
])},async ({session,params,body})=>{
  await getJob(session,params.id);
  return withTransaction(session.userId,async db=>{
    const {rows:[job]}=await db.query('select * from integration_jobs where id=$1 for update',[params.id]);
    if (job.status!=='FAILED' || !job.state.research?.starting) throw conflict('This job has no uncertain research launch to recover.');
    const state={...job.state,research:body.run_id ? {run_id:body.run_id,provider:job.state.active_research_provider ?? job.research_provider,
      execution_mode:job.state.research.execution_mode ?? null,started_at:Date.now(),offset:0,records:[],invalid:0,duplicates:0} : {}};
    const {rows}=await db.query(`update integration_jobs set state=$2,external_job_id=$3,status='REQUESTED',error=null,error_code=null,
      attempts=0,next_run_at=now(),completed_at=null,updated_at=now() where id=$1 returning *`,[job.id,state,body.run_id??null]);
    return accepted({data:publicJob(rows[0])});
  });
});
