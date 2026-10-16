import { route } from '../../lib/http.js';
import { snapshot, command, actionSchema } from '../../workspace/service.js';
export const GET=route({},async({session})=>({data:await snapshot(session)}));
export const POST=route({roles:['ADMIN','MANAGER'],body:actionSchema},async({session,body})=>({data:await command(session,body)}));
