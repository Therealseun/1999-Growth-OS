import { route } from '../../../lib/http.js';
import { query as sql } from '../../../lib/db.js';
import { scope,pageSchema } from '../../../workspace/service.js';
export const GET=route({roles:['ADMIN','MANAGER'],query:pageSchema},async({session,query:f})=>{
  const s=scope(session),args=[...s.args],add=v=>{args.push(v);return '$'+args.length};
  let where=s.sql;
  if(f.campaign_id)where+=` and p.campaign_id=${add(f.campaign_id)}`;
  if(f.status)where+=` and p.qualification_status::text=${add(f.status)}`;
  if(f.search)where+=` and (p.organisation || ' ' || coalesce(p.email,'')) ilike ${add('%'+f.search+'%')}`;
  const {rows:[n]}=await sql(`select count(*)::int as n from prospects p join campaigns c on c.id=p.campaign_id where ${where}`,args);
  const {rows}=await sql(`select p.*,c.name as campaign_name from prospects p join campaigns c on c.id=p.campaign_id where ${where} order by p.created_at desc,p.id limit ${add(f.pageSize)} offset ${add((f.page-1)*f.pageSize)}`,args);
  return {data:rows,total:n.n,page:f.page,pageSize:f.pageSize};
});
