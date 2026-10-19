import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { recoverJob } from '../../../../../service.js';
import { idParams,recoverySchema } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams,body:recoverySchema},async({session,params,body})=>{await extensionReady();return recoverJob(session,params.id,body);});
