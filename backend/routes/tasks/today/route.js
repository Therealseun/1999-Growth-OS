import { z } from 'zod';
import { appToday } from '../../../lib/appdate.js';
import { query } from '../../../lib/db.js';
import { route } from '../../../lib/http.js';
import { assertEmployeeVisible } from '../../../lib/scope.js';
import { todaySummary } from '../../../lib/tasks.js';
import { uuid } from '../../../lib/validators.js';

const q = z.object({ employee_id: uuid.optional() });

// Every number comes from today's immutable workload snapshot, never from current target settings.
export const GET = route({ query: q }, async ({ session, query: f }) => {
  let employeeId = session.profile.id;
  if (f.employee_id && f.employee_id !== employeeId) {
    await assertEmployeeVisible(session.profile, f.employee_id);
    employeeId = f.employee_id;
  }
  return todaySummary(employeeId, await appToday({ query }));
});
