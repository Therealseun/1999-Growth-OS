import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { cancelJob } from '../../../../../service.js';
import { idParams } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams},async({session,params,body})=>{await extensionReady();return cancelJob(session,params.id,body);});
