import { z } from 'zod';
import { route } from '../../../lib/http.js';
import { createUploadUrl, EVIDENCE_CONTENT_TYPES, MAX_EVIDENCE_BYTES } from '../../../lib/storage.js';

const body = z
  .object({
    filename: z.string().trim().min(1).max(200),
    content_type: z.enum(EVIDENCE_CONTENT_TYPES),
    size_bytes: z.number().int().min(1).max(MAX_EVIDENCE_BYTES).optional(),
  })
  .strict();

// Employees upload evidence screenshots. The file goes straight to company storage, not through this server.
export const POST = route({ roles: ['EMPLOYEE'], body }, async ({ session, body: input }) =>
  createUploadUrl(session.userId, input.filename),
);
