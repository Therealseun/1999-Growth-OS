import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { retryJob } from '../../../../../jobs.js';
import { idParams,retrySchema } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams,body:retrySchema},async({session,params,body})=>{await extensionReady();return retryJob(session,params.id,body);});
