import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { requireRole, assertCanSeeDepartment } from '../lib/guard.js';
import { conflict, notFound, invalid } from '../lib/errors.js';
import { publicJob, scopedCampaign } from '../ai/jobs.js';
import { allocateWorkload } from '../lib/task-allocation.js';

const text=z.string().trim().min(1).max(4000), id=z.string().uuid();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create_department'),name:text.max(120)}).strict(),
  z.object({action:z.literal('update_person'),id,role:z.enum(['ADMIN','MANAGER','EMPLOYEE']),status:z.enum(['PENDING','ACTIVE','DISABLED']),department_id:id.nullable()}).strict(),
  z.object({action:z.literal('create_campaign'),name:text.max(200),niche:text,offer:text,location:text,objective:text,department_id:id}).strict(),
  z.object({action:z.literal('update_campaign'),id,name:text.max(200),niche:text,offer:text,location:text,objective:text,status:z.enum(['DRAFT','ACTIVE','PAUSED','ARCHIVED'])}).strict(),
  z.object({action:z.literal('set_targets'),campaign_id:id,email:z.number().int().min(0).max(10000),seo:z.number().int().min(0).max(10000),lead:z.number().int().min(0).max(10000),effective_from:date}).strict(),
  z.object({action:z.literal('assign_employee'),campaign_id:id,employee_id:id,active:z.boolean()}).strict(),
  z.object({action:z.literal('prepare_workloads'),campaign_id:id}).strict(),
  z.object({action:z.literal('allocate'),workload_id:id}).strict(),
]);
export const taskActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('review')}).strict(),
  z.object({action:z.literal('skip'),status:z.enum(['SKIPPED','INVALID']),reason:text}).strict(),
  z.object({action:z.literal('complete'),evidence_type:z.enum(['URL','TEXT']),evidence_value:text.max(10000),confirmed_external_execution:z.literal(true)}).strict(),
]);
export const scope = (session, alias='c') => session.profile.role === 'ADMIN'
  ? {sql:'true',args:[]} : {sql:`${alias}.department_id=$1`,args:[session.profile.department_id]};
export const taskTables={EMAIL:'email_tasks',SEO:'seo_tasks',LEAD_MAGNET:'lead_magnet_tasks'};

export async function snapshot(session) {
  const p=session.profile, s=scope(session), manager=p.role!=='EMPLOYEE';
  const {rows:campaigns}=await query(`select c.* from campaigns c where ${s.sql} order by c.updated_at desc`,s.args);
  const {rows:departments}=await query(p.role==='ADMIN'?'select * from departments order by name':'select * from departments where id=$1',[...(p.role==='ADMIN'?[]:[p.department_id])]);
  const {rows:people}=await query(`select id,name,email,role,status,department_id,created_at from profiles where ${p.role==='ADMIN'?'true':manager?'department_id=$1':'id=$1'} order by name`,p.role==='ADMIN'?[]:[manager?p.department_id:p.id]);
  const ids=campaigns.map(c=>c.id);
  const {rows:workloads}=await query(`select w.*,p.name as employee_name from v_daily_report w join profiles p on p.id=w.employee_id
    where w.campaign_id=any($1::uuid[]) and ($2::uuid is null or w.employee_id=$2) and w.work_date>=app_today()-29 order by w.work_date desc,p.name`,[ids,manager?null:p.id]);
  const {rows:[clock]}=await query('select app_today()::text as today,app_tz() as timezone');
  const {rows:targets}=manager?await query('select * from campaign_targets where campaign_id=any($1::uuid[]) or campaign_id is null order by effective_from desc',[ids]):{rows:[]};
  const {rows:jobs}=manager?await query('select * from integration_jobs where campaign_id=any($1::uuid[]) order by requested_at desc limit 100',[ids]):{rows:[]};
  const {rows:assignments}=await query('select * from campaign_assignments where campaign_id=any($1::uuid[]) and ($2::uuid is null or employee_id=$2)',[ids,manager?null:p.id]);
  return {profile:p,campaigns,departments,people,workloads,targets,jobs:jobs.map(publicJob),assignments,...clock};
}

export async function command(session, body) {
  requireRole(session.profile,['ADMIN','MANAGER']);
  return withTransaction(session.userId,async db=>{
    const b=body;
    if (b.action==='create_department') {
      requireRole(session.profile,['ADMIN']);
      return (await db.query('insert into departments(name) values ($1) returning *',[b.name])).rows[0];
    }
    if (b.action==='update_person') {
      requireRole(session.profile,['ADMIN']);
      // Serialize role changes so concurrent requests cannot remove every active admin.
      await db.query("select id from profiles where role='ADMIN' order by id for update");
      const {rows:[person]}=await db.query('select * from profiles where id=$1 for update',[b.id]);
      if(!person)throw notFound();
      if(person.role==='ADMIN' && person.status==='ACTIVE' && (b.role!=='ADMIN'||b.status!=='ACTIVE')) {
        const {rows:[n]}=await db.query("select count(*)::int as n from profiles where role='ADMIN' and status='ACTIVE'");
        if(n.n<=1)throw conflict('Keep at least one active administrator.');
      }
      if(b.status==='ACTIVE' && b.role!=='ADMIN' && !b.department_id)throw invalid('Active managers and employees need a department.');
      const out=await db.query('update profiles set role=$2,status=$3,department_id=$4,approved_by=$5,approved_at=case when $3=\'ACTIVE\' then now() else approved_at end,updated_at=now() where id=$1 returning id,name,email,role,status,department_id',
        [b.id,b.role,b.status,b.department_id,session.userId]);
      return out.rows[0];
    }
    if(b.action==='create_campaign') {
      assertCanSeeDepartment(session.profile,b.department_id);
      const {rows:[c]}=await db.query('insert into campaigns(name,niche,offer,location,objective,department_id,created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *',[b.name,b.niche,b.offer,b.location,b.objective,b.department_id,session.userId]);
      await db.query('select sync_campaign_assignments($1)',[c.id]); return c;
    }
    if(b.action==='allocate') {
      const {rows:[w]}=await db.query('select campaign_id from daily_workloads where id=$1',[b.workload_id]);if(!w)throw notFound();
      await scopedCampaign(session,w.campaign_id,db);
      return allocateWorkload(db,b.workload_id);
    }
    const campaignId=b.campaign_id ?? b.id;
    const c=await scopedCampaign(session,campaignId,db);
    await db.query('select id from campaigns where id=$1 for update',[c.id]);
    if(b.action==='update_campaign') return (await db.query('update campaigns set name=$2,niche=$3,offer=$4,location=$5,objective=$6,status=$7,updated_at=now() where id=$1 returning *',[c.id,b.name,b.niche,b.offer,b.location,b.objective,b.status])).rows[0];
    if(b.action==='set_targets') {
      requireRole(session.profile,['ADMIN']);
      const {rows:[d]}=await db.query('select $1::date < app_today() as past',[b.effective_from]);
      if(d.past)throw invalid('Targets cannot take effect in the past.');
      return (await db.query('insert into campaign_targets(campaign_id,email_daily_target,seo_daily_target,lead_magnet_daily_target,effective_from,updated_by) values($1,$2,$3,$4,$5,$6) returning *',[c.id,b.email,b.seo,b.lead,b.effective_from,session.userId])).rows[0];
    }
    if(b.action==='assign_employee') {
      const {rows:[p]}=await db.query("select * from profiles where id=$1 and department_id=$2 and role='EMPLOYEE' and status='ACTIVE'",[b.employee_id,c.department_id]);
      if(!p)throw invalid('Select an active employee in the campaign department.');
      return (await db.query("insert into campaign_assignments(campaign_id,employee_id,active,source) values($1,$2,$3,'MANUAL') on conflict(campaign_id,employee_id) do update set active=excluded.active,source='MANUAL' returning *",[c.id,p.id,b.active])).rows[0];
    }
    if(b.action==='prepare_workloads') {
      if(c.status!=='ACTIVE')throw conflict('Activate the campaign before preparing daily workloads.');
      const {rows:[t]}=await db.query('select (effective_targets($1,app_today())).*',[c.id]);
      if(!t?.id)throw conflict('An administrator must set campaign targets first.');
      await db.query('select sync_campaign_assignments($1)',[c.id]);
      await db.query("update lead_magnet_tasks set status='EXPIRED' where campaign_id=$1 and status in ('READY','REVIEWED') and created_at<now()-make_interval(days=>coalesce((select (value #>> '{}')::int from app_settings where key='lead_magnet_expiry_days'),2))",[c.id]);
      const {rows:staff}=await db.query("select a.employee_id from campaign_assignments a join profiles p on p.id=a.employee_id where a.campaign_id=$1 and a.active and p.status='ACTIVE' and p.role='EMPLOYEE' and p.department_id=$2",[c.id,c.department_id]);
      if(!staff.length)throw conflict('Assign at least one active employee to this campaign.');
      for(const p of staff) {
        await db.query(`insert into daily_workloads(campaign_id,employee_id,work_date,targets_id,email_target_snapshot,seo_target_snapshot,lead_magnet_target_snapshot,carried_in_email,carried_in_seo,carried_in_lead_magnet)
          select $1,$2,app_today(),$3,$4,$5,$6,
          (select count(*) from email_tasks where campaign_id=$1 and employee_id=$2 and status in ('READY','REVIEWED')),
          (select count(*) from seo_tasks where campaign_id=$1 and employee_id=$2 and status in ('READY','REVIEWED')),
          (select count(*) from lead_magnet_tasks where campaign_id=$1 and employee_id=$2 and status in ('READY','REVIEWED'))
          on conflict(campaign_id,employee_id,work_date) do nothing`,[c.id,p.employee_id,t.id,t.email_daily_target,t.seo_daily_target,t.lead_magnet_daily_target]);
      }
      const {rows:workloads}=await db.query('select id from daily_workloads where campaign_id=$1 and work_date=app_today() order by generated_at,id',[c.id]);
      for(const w of workloads)await allocateWorkload(db,w.id);
      return {workloads:workloads.length};
    }
    throw invalid('Unknown command.');
  });
}

export const pageSchema=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50),campaign_id:id.optional(),workstream:z.enum(['EMAIL','SEO','LEAD_MAGNET']).optional(),status:z.string().max(40).optional(),search:z.string().max(200).optional()});
export async function listTasks(session, filters) {
  const p=session.profile,s=scope(session);const args=[...s.args];
  const add=value=>{args.push(value);return '$'+args.length};
  let where=s.sql;
  if(p.role==='EMPLOYEE')where+=` and t.employee_id=${add(p.id)}`;
  if(filters.campaign_id)where+=` and t.campaign_id=${add(filters.campaign_id)}`;
  if(filters.workstream)where+=` and t.workstream=${add(filters.workstream)}`;
  if(filters.status)where+=` and t.status=${add(filters.status)}`;
  const source=`(select 'EMAIL' as workstream,id,campaign_id,employee_id,subject as title,status::text,created_at from email_tasks
    union all select 'SEO',id,campaign_id,employee_id,title,status::text,created_at from seo_tasks
    union all select 'LEAD_MAGNET',id,campaign_id,employee_id,platform || ': ' || left(comment,90),status::text,created_at from lead_magnet_tasks) t join campaigns c on c.id=t.campaign_id`;
  const {rows:[total]}=await query(`select count(*)::int as n from ${source} where ${where}`,args);
  const {rows}=await query(`select t.*,c.name as campaign_name,p.name as employee_name from ${source} left join profiles p on p.id=t.employee_id where ${where} order by t.created_at desc,t.id limit ${add(filters.pageSize)} offset ${add((filters.page-1)*filters.pageSize)}`,args);
  return {data:rows,total:total.n,page:filters.page,pageSize:filters.pageSize};
}
export async function taskDetail(session,id,ws,db={query},lock=false) {
  const table=taskTables[ws];if(!table)throw invalid('Select a valid workstream.');
  const {rows:[t]}=await db.query(`select t.*,c.department_id,c.name as campaign_name from ${table} t join campaigns c on c.id=t.campaign_id where t.id=$1 ${lock?'for update of t':''}`,[id]);
  if(!t)throw notFound();
  if(session.profile.role==='EMPLOYEE') {if(t.employee_id!==session.userId)throw notFound();}
  else assertCanSeeDepartment(session.profile,t.department_id);
  const fk=ws==='EMAIL'?'email_task_id':ws==='SEO'?'seo_task_id':'lead_task_id';
  const {rows:evidence}=await db.query(`select * from execution_evidence where ${fk}=$1 order by created_at`,[id]);
  let prospect=null;
  if(ws==='EMAIL')prospect=(await db.query('select organisation,contact_name,email,website from prospects where id=$1',[t.prospect_id])).rows[0];
  return {...t,workstream:ws,evidence,prospect};
}
export async function updateTask(session,id,ws,b) {
  return withTransaction(session.userId,async db=>{
    const t=await taskDetail(session,id,ws,db,true),table=taskTables[ws];
    if(!['READY','REVIEWED'].includes(t.status))throw conflict('This task is closed or completed.');
    if(b.action==='review') {if(!t.employee_id)throw conflict('Assign this task to an employee before review.');await db.query(`update ${table} set status='REVIEWED',reviewed_at=now() where id=$1`,[id]);return {ok:true};}
    if(b.action==='skip') {await db.query(`update ${table} set status=$2,skip_reason=$3 where id=$1`,[id,b.status,b.reason]);return {ok:true};}
    if(!t.employee_id)throw conflict('Assign this task to an employee before recording execution.');
    if(t.status!=='REVIEWED')throw conflict('Review the task before recording external execution.');
    if(ws!=='EMAIL' && b.evidence_type!=='URL')throw invalid('A published/post URL is required for this workstream.');
    if(b.evidence_type==='URL') {try {const u=new URL(b.evidence_value);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{throw invalid('Provide a valid HTTP(S) evidence URL.');}}
    const fk=ws==='EMAIL'?'email_task_id':ws==='SEO'?'seo_task_id':'lead_task_id';
    await db.query(`insert into execution_evidence(workstream,${fk},employee_id,evidence_type,evidence_value) values($1,$2,$3,$4,$5)`,[ws,id,t.employee_id,b.evidence_type,b.evidence_value]);
    if(ws==='EMAIL')await db.query("update email_tasks set status='SENT',sent_at=now() where id=$1",[id]);
    if(ws==='SEO')await db.query("update seo_tasks set status='PUBLISHED',published_at=now(),published_url=$2 where id=$1",[id,b.evidence_value]);
    if(ws==='LEAD_MAGNET')await db.query("update lead_magnet_tasks set status='POSTED',posted_at=now(),evidence_url=$2 where id=$1",[id,b.evidence_value]);
    return {ok:true};
  });
}
