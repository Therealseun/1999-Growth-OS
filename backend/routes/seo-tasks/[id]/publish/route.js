import { route } from '../../../../lib/http.js';
import { completeTask, publishBody } from '../../../../lib/tasks.js';
import { idParam } from '../../../../lib/validators.js';

export const POST = route({ roles: ['EMPLOYEE'], body: publishBody }, async ({ session, params, body }) =>
  completeTask('seo', session, idParam(params), body),
);
