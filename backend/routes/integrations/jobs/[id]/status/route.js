import { z } from 'zod';
import { withTransaction } from '../../../../../lib/db.js';
import { updateJobStatus } from '../../../../../lib/delivery.js';
import { route } from '../../../../../lib/http.js';
import { jobView } from '../../../../../lib/serializers.js';
import { SCOPES } from '../../../../../lib/service-auth.js';
import { idParam } from '../../../../../lib/validators.js';

const body = z
  .object({
    status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
    external_job_id: z.string().trim().min(1).max(200).optional(),
    error: z.string().max(1000).optional(),
  })
  .strict();

// The service calls this with COMPLETED after the last batch, or FAILED with an error.
export const POST = route({ auth: 'integration', scope: SCOPES.DELIVER, body }, async ({ params, body: input }) => {
  const job = await withTransaction(null, (db) =>
    updateJobStatus(db, { jobId: idParam(params), status: input.status, externalJobId: input.external_job_id, error: input.error }),
  );
  return jobView(job);
});
