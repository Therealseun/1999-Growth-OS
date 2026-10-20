import { route } from '../../../lib/http.js';
import { getTask, patchBody, patchTask } from '../../../lib/tasks.js';
import { idParam } from '../../../lib/validators.js';

export const GET = route({}, async ({ session, params }) => getTask('lead', session, idParam(params)));

// Only the assigned employee may change a task. Completed tasks answer 409 TASK_LOCKED.
export const PATCH = route({ roles: ['EMPLOYEE'], body: patchBody('lead') }, async ({ session, params, body }) =>
  patchTask('lead', session, idParam(params), body),
);
