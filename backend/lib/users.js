// Keeps campaign assignments in step with who works in a department.
// sync_campaign_assignments() adds new people and switches off people who left. It never switches a person
// back on, so someone who was disabled and later restored would never get work again. reactivateEmployee fixes that.
export async function syncDepartmentCampaigns(db, departmentId, { reactivateEmployee } = {}) {
  if (!departmentId) return;
  await db.query(
    "select sync_campaign_assignments(id) from campaigns where department_id = $1 and status <> 'ARCHIVED'",
    [departmentId],
  );
  if (reactivateEmployee) {
    await db.query(
      `update campaign_assignments a set active = true
         from campaigns c, profiles p
        where c.id = a.campaign_id and c.department_id = $1 and c.status <> 'ARCHIVED'
          and a.employee_id = $2 and a.source = 'AUTO' and not a.active
          and p.id = a.employee_id and p.department_id = c.department_id
          and p.role = 'EMPLOYEE' and p.status = 'ACTIVE'`,
      [departmentId, reactivateEmployee],
    );
  }
}
