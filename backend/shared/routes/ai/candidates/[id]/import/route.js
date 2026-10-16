import { route } from '../../../../../../lib/http.js';
import { extensionReady } from '../../../../../db.js';
import { importCandidate } from '../../../../../service.js';
import { importSchema,idParams } from '../../../../../contracts.js';
const roles=['ADMIN','MANAGER'];
export const POST=route({roles,params:idParams,body:importSchema},async({session,params,body})=>{await extensionReady();return importCandidate(session,params.id,body);});
