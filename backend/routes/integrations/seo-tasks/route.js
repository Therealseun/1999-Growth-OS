import { z } from 'zod';
import { deliverSeoTasks, MAX_BATCH } from '../../../lib/delivery.js';
import { withTransaction } from '../../../lib/db.js';
import { json, route } from '../../../lib/http.js';
import { assignNow } from '../../../lib/pipeline.js';
import { SCOPES } from '../../../lib/service-auth.js';
import { uuid } from '../../../lib/validators.js';

// Each item is checked on its own. One bad item never fails the batch. The answer lists CREATED, DUPLICATE or
// REJECTED per item, so resending a batch is always safe.
const body = z.object({
  job_id: uuid,
  campaign_id: uuid,
  items: z.array(z.unknown()).min(1).max(MAX_BATCH),
});

export const POST = route(
  { auth: 'integration', scope: SCOPES.DELIVER, body, maxBytes: 10 * 1024 * 1024 },
  async ({ body: input }) => {
    const result = await withTransaction(null, (db) =>
      deliverSeoTasks(db, { jobId: input.job_id, campaignId: input.campaign_id, items: input.items }),
    );
  if (result.accepted > 0) await assignNow();
    return json(result, 207);
  },
);
