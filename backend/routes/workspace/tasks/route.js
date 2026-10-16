import { route } from '../../../lib/http.js';
import { listTasks,pageSchema } from '../../../workspace/service.js';
export const GET=route({query:pageSchema},async({session,query})=>listTasks(session,query));
