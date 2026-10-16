import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { approveProfile } from '../../../../../service.js';
import { idParams } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams,body:idParams},async({session,params,body})=>{await extensionReady();return approveProfile(session,params.id,body.id);});
