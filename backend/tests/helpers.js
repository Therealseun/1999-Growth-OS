import { SignJWT } from 'jose';
import { closePool, query } from '@/lib/db';

export const ISSUER = 'https://testproject.supabase.co/auth/v1';
export const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);

export async function signToken(sub, overrides = {}) {
  const { secret = SECRET, issuer = ISSUER, audience = 'authenticated', expiresIn = '1h', claims = {} } = overrides;
  return new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export function request(path, { method = 'GET', token, headers = {}, body } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new Request(`http://localhost${path}`, init);
}

let counter = 0;

// Inserts into auth.users (a trigger creates the PENDING profile), then sets role, status and department.
export async function createUser({ role = 'EMPLOYEE', status = 'ACTIVE', departmentId = null, name } = {}) {
  counter += 1;
  const email = `user${counter}-${Date.now()}@test.local`;
  const { rows } = await query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ name: name ?? `User ${counter}` })],
  );
  const id = rows[0].id;
  await query('update profiles set role = $2, status = $3, department_id = $4 where id = $1', [id, role, status, departmentId]);
  return { id, email };
}

export async function createDepartment(name = `Dept ${++counter}`) {
  const { rows } = await query('insert into departments (name) values ($1) returning id', [name]);
  return rows[0].id;
}

export async function resetData() {
  await query(
    'truncate auth.users, audit_log, integration_clients, departments, campaigns, prospects cascade',
  );
}

export async function shutdown() {
  await closePool();
}
