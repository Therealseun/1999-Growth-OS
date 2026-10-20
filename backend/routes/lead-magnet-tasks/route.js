import { route } from '../../lib/http.js';
import { listQuery, listTasks } from '../../lib/tasks.js';

// Employee: own tasks. Manager: tasks of their department. Admin: all. Unassigned (pool) tasks are not listed.
export const GET = route({ query: listQuery('lead') }, async ({ session, query }) => listTasks('lead', session, query));
