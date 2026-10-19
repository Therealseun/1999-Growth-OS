import { z } from 'zod';
import { query, withTransaction } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';
import { created, route } from '../../lib/http.js';

const querySchema = z.object({
  campaignId: z.string().uuid().optional(),
  status: z.enum(['QUALIFIED', 'REJECTED', 'NEEDS_REVIEW']).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function managerScope(profile, campaignAlias = 'c', position = 1) {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (!profile.department_id) return { sql: 'false', params: [] };
  return { sql: `${campaignAlias}.department_id = $${position}`, params: [profile.department_id] };
}

export const GET = route({ roles: ['ADMIN', 'MANAGER'], query: querySchema }, async ({ session, query: filters }) => {
  const { sql, params } = managerScope(session.profile);
  const where = [sql];
  if (filters.campaignId) {
    params.push(filters.campaignId);
    where.push(`p.campaign_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`p.qualification_status = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(p.organisation ilike $${params.length} or p.contact_name ilike $${params.length} or p.email ilike $${params.length})`);
  }
  const condition = where.join(' and ');
  const [result, count] = await Promise.all([
    query(
      `select p.* from prospects p join campaigns c on c.id = p.campaign_id
       where ${condition} order by p.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    ),
    query(`select count(*)::int as total from prospects p join campaigns c on c.id = p.campaign_id where ${condition}`, params),
  ]);
  return { data: result.rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
});

const createSchema = z.object({
  campaignId: z.string().uuid(),
  siftId: z.string().trim().min(1).max(200),
  organisation: z.string().trim().min(1).max(500),
  contactName: z.string().trim().max(300).optional(),
  email: z.string().trim().email().max(254).optional(),
  website: z.string().trim().url().max(2048).optional(),
  industry: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
});

export const POST = route(
  { roles: ['ADMIN', 'MANAGER'], body: createSchema },
  async ({ session, body }) => withTransaction(session.userId, async (client) => {
    const { sql, params } = managerScope(session.profile, 'c', 2);
    const values = [body.campaignId, ...params];
    const campaign = await client.query(
      `select c.id from campaigns c where c.id = $1 and ${sql}`,
      values,
    );
    if (!campaign.rowCount) throw notFound();
    const { rows } = await client.query(
      `insert into prospects (campaign_id, sift_id, organisation, contact_name, email, website, industry, location)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [body.campaignId, body.siftId, body.organisation, body.contactName ?? null,
        body.email ?? null, body.website ?? null, body.industry ?? null, body.location ?? null],
    );
    return created({ data: rows[0] });
  }),
);
