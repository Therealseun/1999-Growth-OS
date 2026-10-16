import { route } from '../../../../../lib/http.js';
import { extensionReady } from '../../../../db.js';
import { overview,saveSettings } from '../../../../service.js';
import { settingsSchema,idParams } from '../../../../contracts.js';
import { z } from 'zod';
const roles=['ADMIN','MANAGER'];
export const GET=route({roles,params:idParams,query:z.object({offset:z.coerce.number().int().min(0).max(100000).default(0)})},async({session,params,query})=>{await extensionReady();return overview(session,params.id,query.offset);});
export const PATCH=route({roles,params:idParams,body:settingsSchema},async({session,params,body})=>{await extensionReady();return saveSettings(session,params.id,body);});
