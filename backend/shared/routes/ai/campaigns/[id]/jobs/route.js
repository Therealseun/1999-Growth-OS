import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { enqueue } from '../../../../../jobs.js';
import { jobSchema,idParams } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams,body:jobSchema},async({session,params,body})=>{await extensionReady();return enqueue(session,params.id,body);});
