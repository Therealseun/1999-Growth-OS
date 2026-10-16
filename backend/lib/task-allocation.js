// Uses the same snapshot/ledger rules as assign_pool_tasks, scoped to one workload.
// Safe for manager operations and worker deliveries; table names are constants.
export async function allocateWorkload(db,id) {
  const {rows:[w]}=await db.query(`select w.* from daily_workloads w join campaigns c on c.id=w.campaign_id
    join profiles p on p.id=w.employee_id join campaign_assignments a on a.campaign_id=w.campaign_id and a.employee_id=w.employee_id
    where w.id=$1 and w.work_date=app_today() and c.status='ACTIVE' and p.status='ACTIVE' and p.role='EMPLOYEE'
      and p.department_id=c.department_id and a.active for update of w`,[id]);
  if(!w)return [];
  const result=[];
  for(const [ws,table,key] of [['EMAIL','email_tasks','email_target_snapshot'],['SEO','seo_tasks','seo_target_snapshot'],['LEAD_MAGNET','lead_magnet_tasks','lead_magnet_target_snapshot']]) {
    const {rows:[n]}=await db.query(`select count(*)::int as n from v_task_ledger where campaign_id=$1 and employee_id=$2 and ws=$3
      and (status_class='OPEN' or(status_class='COMPLETED' and app_date(completed_at)=$4))`,[w.campaign_id,w.employee_id,ws,w.work_date]);
    const need=Math.max(0,w[key]-n.n);
    const {rowCount}=await db.query(`with picked as (select id from ${table} where campaign_id=$1 and employee_id is null and status='READY' order by created_at,id limit $2 for update skip locked)
      update ${table} t set employee_id=$3,assigned_at=now() from picked where t.id=picked.id`,[w.campaign_id,need,w.employee_id]);
    result.push({workstream:ws,assigned:rowCount,shortfall:Math.max(0,need-rowCount)});
  }
  return result;
}
