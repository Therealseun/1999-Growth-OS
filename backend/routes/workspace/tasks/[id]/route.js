import { z } from 'zod';
import { route } from '../../../../lib/http.js';
import { taskDetail,updateTask,taskActionSchema } from '../../../../workspace/service.js';
const paramsQuery=z.object({workstream:z.enum(['EMAIL','SEO','LEAD_MAGNET'])});
const params=z.object({id:z.string().uuid()});
export const GET=route({params,query:paramsQuery},async({session,params,query})=>({data:await taskDetail(session,params.id,query.workstream)}));
export const POST=route({params,query:paramsQuery,body:taskActionSchema},async({session,params,query,body})=>({data:await updateTask(session,params.id,query.workstream,body)}));
