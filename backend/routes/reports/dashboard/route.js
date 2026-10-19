import { query } from '../../../lib/db.js';
import { route } from '../../../lib/http.js';

function campaignScope(profile, alias = 'c') {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (profile.role === 'MANAGER') {
    return profile.department_id
      ? { sql: `${alias}.department_id = $1`, params: [profile.department_id] }
      : { sql: 'false', params: [] };
  }
  return {
    sql: `exists (select 1 from campaign_assignments ca where ca.campaign_id = ${alias}.id and ca.employee_id = $1 and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({}, async ({ session }) => {
  const profile = session.profile;
  const campaignAccess = campaignScope(profile);
  const taskParams = [];
  let taskCondition = 'true';
  if (profile.role === 'EMPLOYEE') {
    taskParams.push(profile.id);
    taskCondition = 'x.employee_id = $1';
  } else if (profile.role === 'MANAGER') {
    if (!profile.department_id) taskCondition = 'false';
    else {
      taskParams.push(profile.department_id);
      taskCondition = 'c.department_id = $1';
    }
  }
  const campaignParams = campaignAccess.params;
  const [campaignCount, campaignActive, recentCampaigns, taskCounts, prospectCount, recentProspects] =
    await Promise.all([
      query(`select count(*)::int as total from campaigns c where ${campaignAccess.sql}`, campaignParams),
      query(`select count(*)::int as total from campaigns c where ${campaignAccess.sql} and c.status = 'ACTIVE'`, campaignParams),
      query(
        `select c.*, d.name as department_name,
          (select count(*)::int from prospects p where p.campaign_id = c.id) as prospect_count,
          ((select count(*) from email_tasks e where e.campaign_id = c.id) +
           (select count(*) from seo_tasks s where s.campaign_id = c.id) +
           (select count(*) from lead_magnet_tasks m where m.campaign_id = c.id))::int as task_count
         from campaigns c join departments d on d.id = c.department_id
         where ${campaignAccess.sql} order by c.updated_at desc limit 5`,
        campaignParams,
      ),
      query(
        `select count(*)::int as total,
          count(*) filter (where x.task_status in ('SENT', 'PUBLISHED', 'POSTED'))::int as completed,
          count(*) filter (where x.task_status = 'REVIEWED')::int as in_progress,
          count(*) filter (where x.task_status = 'READY')::int as pending,
          count(*) filter (where x.task_status in ('SKIPPED', 'INVALID', 'EXPIRED'))::int as blocked
         from (
           select e.campaign_id, e.employee_id, e.status::text as task_status from email_tasks e
           union all
           select s.campaign_id, s.employee_id, s.status::text from seo_tasks s
           union all
           select m.campaign_id, m.employee_id, m.status::text from lead_magnet_tasks m
         ) x join campaigns c on c.id = x.campaign_id where ${taskCondition}`,
        taskParams,
      ),
      profile.role === 'EMPLOYEE'
        ? Promise.resolve({ rows: [{ total: 0 }] })
        : query('select count(*)::int as total from prospects p join campaigns c on c.id = p.campaign_id where ' + campaignAccess.sql, campaignParams),
      profile.role === 'EMPLOYEE'
        ? Promise.resolve({ rows: [] })
        : query(
          `select p.* from prospects p join campaigns c on c.id = p.campaign_id
           where ${campaignAccess.sql} order by p.created_at desc limit 5`,
          campaignParams,
        ),
    ]);
  const tasks = taskCounts.rows[0];
  const distribution = [
    { name: 'Completed', value: tasks.completed, count: tasks.completed },
    { name: 'In progress', value: tasks.in_progress, count: tasks.in_progress },
    { name: 'Pending', value: tasks.pending, count: tasks.pending },
    { name: 'Blocked', value: tasks.blocked, count: tasks.blocked },
  ];
  return {
    data: {
      stats: {
        campaignsCount: campaignCount.rows[0].total,
        activeCampaignsCount: campaignActive.rows[0].total,
        prospectsCount: prospectCount.rows[0].total,
        tasksCount: tasks.total,
        completedTasksCount: tasks.completed,
        pendingTasksCount: tasks.pending + tasks.in_progress,
        conversionRate: null,
        revenueOpportunity: null,
      },
      recentCampaigns: recentCampaigns.rows,
      recentProspects: recentProspects.rows,
      taskDistribution: distribution,
    },
  };
});
