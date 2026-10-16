import { z } from 'zod';
import { route } from '../../lib/http.js';
import { withTransaction } from '../../lib/db.js';
export const PATCH=route({body:z.object({name:z.string().trim().min(1).max(120)}).strict()},async({session,body})=>{
  const {rows:[profile]}=await withTransaction(session.userId,db=>db.query('update profiles set name=$2,updated_at=now() where id=$1 returning id,name,email,role,status,department_id,created_at,updated_at',[session.userId,body.name]));
  return {data:profile};
});
