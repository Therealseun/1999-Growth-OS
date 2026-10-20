import { query,withTransaction } from '../lib/db.js';
import { forbidden,conflict,notFound } from '../lib/errors.js';
export { query,withTransaction };
export async function asUser(db,actor,fn) {
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role:'authenticated'})]);
 await db.query('set local role authenticated');
 const result=await fn(db); // An exception aborts/rolls back the enclosing transaction.
 await db.query('reset role');
 return result;
}
export async function manager(actor,db={query}) {
 const {rows:[p]}=await db.query('select id,full_name,email,role,active from public.profiles where id=$1',[actor]);
 if(!p?.active||!['ADMIN','MANAGER'].includes(p.role))throw forbidden('An active manager or administrator is required.');
 return p;
}
export async function campaign(actor,id,db={query},lock=false) {
 await manager(actor,db);
 // Live exported policies permit all active managers to manage campaigns. No invented departments.
 const {rows:[c]}=await db.query(`select * from public.campaigns where id=$1 ${lock?'for update':''}`,[id]);
 if(!c)throw notFound('Campaign not found.');return c;
}
export async function extensionReady() {
 const {rows:[r]}=await query("select to_regclass('growthos_ai.version') is not null as installed");
 if(!r.installed)throw conflict('AI extension is not installed. Keep using the existing app; review the additive shared-schema migration with your team.','AI_EXTENSION_MISSING');
}
export async function checkBase(db={query}) {
 const {rows}=await db.query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('profiles','campaigns','tasks','prospects','email_drafts','workload_targets')");
 const found=new Set(rows.map(r=>r.table_name+'.'+r.column_name));
 const required=['profiles.id','profiles.full_name','profiles.email','profiles.role','profiles.active','campaigns.id','campaigns.name','campaigns.niche','campaigns.target_audience','campaigns.objective','campaigns.status','campaigns.owner_id','tasks.id','tasks.assigned_to','tasks.status','prospects.id','prospects.first_name','prospects.last_name','prospects.email','prospects.company','prospects.campaign_id','prospects.status','email_drafts.prospect_ids'];
 if(required.some(k=>!found.has(k)))throw conflict('Database does not match the shared team schema. Do not run foundation migrations on it.','SHARED_SCHEMA_MISMATCH');
}
