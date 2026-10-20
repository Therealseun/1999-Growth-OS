import { z } from 'zod';
import { withTransaction } from '../../../lib/db.js';
import { deliverNicheProfile } from '../../../lib/delivery.js';
import { created, json, route } from '../../../lib/http.js';
import { nicheView } from '../../../lib/serializers.js';
import { SCOPES } from '../../../lib/service-auth.js';
import { uuid } from '../../../lib/validators.js';

const body = z.object({
  job_id: uuid,
  campaign_id: uuid,
  // The Niche Intelligence JSON belongs to the AI developer and changes as they iterate. It is stored as sent.
  profile: z.record(z.unknown()).refine((p) => Object.keys(p).length > 0, 'The profile cannot be empty'),
});

// 201 for a new draft. 200 with the stored profile when the same job delivers again.
export const POST = route(
  { auth: 'integration', scope: SCOPES.DELIVER, body, maxBytes: 2 * 1024 * 1024 },
  async ({ body: input }) => {
    const out = await withTransaction(null, (db) =>
      deliverNicheProfile(db, { jobId: input.job_id, campaignId: input.campaign_id, profile: input.profile }),
    );
    return out.created ? created(nicheView(out.profile)) : json(nicheView(out.profile), 200);
  },
);
