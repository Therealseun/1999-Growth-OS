import { route } from '../../../../lib/http.js';
import { completeTask, markSentBody } from '../../../../lib/tasks.js';
import { idParam } from '../../../../lib/validators.js';

export const POST = route({ roles: ['EMPLOYEE'], body: markSentBody }, async ({ session, params, body }) =>
  completeTask('email', session, idParam(params), body),
);
