import { z } from 'zod';
import { query } from '../../../../lib/db.js';
import { route } from '../../../../lib/http.js';
import { decodeCursor, finishPage, TS } from '../../../../lib/pagination.js';
import { loadCampaign } from '../../../../lib/scope.js';
import { PROSPECT_COLUMNS } from '../../../../lib/serializers.js';
import { idParam, pageQuery } from '../../../../lib/validators.js';

const q = z.object({ qualification_status: z.enum(['QUALIFIED', 'REJECTED', 'NEEDS_REVIEW']).optional(), ...pageQuery });

export const GET = route({ roles: ['ADMIN', 'MANAGER'], query: q }, async ({ session, params, query: f }) => {
  const id = idParam(params);
  await loadCampaign({ query }, session.profile, id);
  const values = [id];
  const add = (v) => {
    values.push(v);
    return `$${values.length}`;
  };
  const where = ['campaign_id = $1'];
  if (f.qualification_status) where.push(`qualification_status = ${add(f.qualification_status)}`);
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    where.push(`(created_at, id) < (${add(c.ts)}::timestamptz, ${add(c.id)}::uuid)`);
  }
  const { rows } = await query(
    `select ${PROSPECT_COLUMNS}, ${TS('created_at')} as _ts from prospects
      where ${where.join(' and ')} order by created_at desc, id desc limit ${add(f.limit + 1)}`,
    values,
  );
  return finishPage(rows, f.limit);
});
