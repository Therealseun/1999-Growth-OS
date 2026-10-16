import { route } from '../../../lib/http.js';
import { getJob, publicJob } from '../../../ai/jobs.js';
export const GET=route({roles:['ADMIN','MANAGER']},async ({session,params})=>({data:publicJob(await getJob(session,params.id))}));
