import { route } from '../../../../lib/http.js';
import { completeTask, markPostedBody } from '../../../../lib/tasks.js';
import { idParam } from '../../../../lib/validators.js';

export const POST = route({ roles: ['EMPLOYEE'], body: markPostedBody }, async ({ session, params, body }) =>
  completeTask('lead', session, idParam(params), body),
);
