import { z } from 'zod';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, withTransaction } from '@/lib/db';
import { created, json, noContent, route } from '@/lib/http';
import { SCOPES, generateIntegrationKey } from '@/lib/service-auth';
import { createUser, request, resetData, shutdown, signToken } from './helpers.js';

beforeEach(resetData);
afterAll(shutdown);

const ok = async () => ({ ok: true });

describe('route wrapper: callers and roles', () => {
  it('lets an allowed role through and blocks others with 403', async () => {
    const handler = route({ roles: ['ADMIN'] }, async ({ session }) => ({ who: session.profile.role }));
    const admin = await createUser({ role: 'ADMIN' });
    const employee = await createUser({ role: 'EMPLOYEE' });

    const good = await handler(request('/x', { token: await signToken(admin.id) }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ who: 'ADMIN' });

    const bad = await handler(request('/x', { token: await signToken(employee.id) }));
    expect(bad.status).toBe(403);
    expect((await bad.json()).error.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('answers 401 without a token and never runs the handler', async () => {
    const spy = vi.fn(ok);
    const res = await route({}, spy)(request('/x'));
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it('puts a request id on every response', async () => {
    const good = await route({ auth: 'none' }, ok)(request('/x'));
    const bad = await route({}, ok)(request('/x'));
    expect(good.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(bad.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('supports promised and plain params, and the response helpers', async () => {
    const h = route({ auth: 'none' }, async ({ params }) => created({ id: params.id }));
    expect(await (await h(request('/x'), { params: Promise.resolve({ id: '1' }) })).json()).toEqual({ id: '1' });
    const plain = await h(request('/x'), { params: { id: '2' } });
    expect(plain.status).toBe(201);
    expect(noContent().status).toBe(204);
    expect(json({}, 202).status).toBe(202);
  });

  it('rejects misconfigured routes when they are defined', () => {
    expect(() => route({ auth: 'cron', roles: ['ADMIN'] }, ok)).toThrow();
    expect(() => route({ auth: 'user', scope: 'x' }, ok)).toThrow();
  });
});

describe('route wrapper: validation', () => {
  const body = z.object({ name: z.string().min(1), count: z.number().int().min(0) });
  const handler = route({ auth: 'none', body, query: z.object({ page: z.coerce.number().int().min(1).default(1) }) }, async ({ body: b, query: q }) => ({ b, q }));

  it('returns parsed body and query', async () => {
    const res = await handler(request('/x?page=3', { method: 'POST', body: { name: 'a', count: 2, extra: 'dropped' } }));
    expect(await res.json()).toEqual({ b: { name: 'a', count: 2 }, q: { page: 3 } });
  });

  it('answers 422 with the failing fields', async () => {
    const res = await handler(request('/x', { method: 'POST', body: { name: '', count: 'x' } }));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details.fields.map((f) => f.path).sort()).toEqual(['count', 'name']);
  });

  it('answers 422 INVALID_JSON for a broken body and for a bad query', async () => {
    const res = await handler(request('/x', { method: 'POST', body: '{nope' }));
    expect((await res.json()).error.code).toBe('INVALID_JSON');
    const q = await handler(request('/x?page=0', { method: 'POST', body: { name: 'a', count: 1 } }));
    expect(q.status).toBe(422);
  });

  it('answers 413 when the body is too large', async () => {
    const small = route({ auth: 'none', body: z.any(), maxBytes: 50 }, ok);
    const res = await small(request('/x', { method: 'POST', body: { text: 'x'.repeat(200) } }));
    expect(res.status).toBe(413);
  });

  it('allows an optional body to be left out', async () => {
    const h = route({ auth: 'none', body: z.object({ note: z.string() }).optional() }, async ({ body: b }) => ({ b: b ?? null }));
    expect(await (await h(request('/x', { method: 'POST' }))).json()).toEqual({ b: null });
  });
});

describe('route wrapper: errors', () => {
  it('turns unexpected errors into a safe 500 and logs the cause', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route({ auth: 'none' }, async () => {
      throw new Error('secret connection string');
    })(request('/x'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    expect(spy.mock.calls[0][0]).toContain('secret connection string');
    spy.mockRestore();
  });

  it('turns database rule violations into 409 through the handler', async () => {
    await query("insert into departments (name) values ('Same')");
    const admin = await createUser({ role: 'ADMIN' });
    const h = route({ roles: ['ADMIN'] }, async ({ session }) =>
      withTransaction(session.userId, (db) => db.query("insert into departments (name) values ('Same')")),
    );
    const res = await h(request('/x', { token: await signToken(admin.id) }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('DUPLICATE');
  });
});

describe('integration keys (AI and Sift services)', () => {
  const handler = route({ auth: 'integration', scope: SCOPES.DELIVER }, async ({ client }) => ({ name: client.name }));

  async function addClient({ scopes = [SCOPES.DELIVER], revoked = false } = {}) {
    const { key, hash } = generateIntegrationKey();
    await query('insert into integration_clients (name, key_hash, scopes, revoked_at) values ($1,$2,$3,$4)', [
      'ai-service', hash, scopes, revoked ? new Date() : null,
    ]);
    return key;
  }
  const call = (key) => handler(request('/x', { headers: key ? { 'x-integration-key': key } : {} }));

  it('accepts a valid key and records last use', async () => {
    const key = await addClient();
    const res = await call(key);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'ai-service' });
    const { rows } = await query('select last_used_at from integration_clients');
    expect(rows[0].last_used_at).not.toBeNull();
  });

  it('stores only a hash, never the key', async () => {
    const key = await addClient();
    const { rows } = await query('select key_hash from integration_clients');
    expect(rows[0].key_hash).not.toContain(key);
    expect(key.startsWith('gos_')).toBe(true);
  });

  it('rejects missing, unknown and revoked keys with 401', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('gos_unknown')).status).toBe(401);
    const revoked = await addClient({ revoked: true });
    expect((await call(revoked)).status).toBe(401);
  });

  it('rejects a key without the needed scope with 403', async () => {
    const key = await addClient({ scopes: [] });
    const res = await call(key);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('MISSING_SCOPE');
  });

  it('a user token does not work on an integration route', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const res = await handler(request('/x', { token: await signToken(admin.id) }));
    expect(res.status).toBe(401);
  });
});

describe('scheduler secret', () => {
  const handler = route({ auth: 'cron' }, ok);
  const call = (token) => handler(request('/x', { method: 'POST', token }));

  it('accepts the right secret only', async () => {
    expect((await call('c'.repeat(40))).status).toBe(200);
    expect((await call('c'.repeat(39) + 'd')).status).toBe(401);
    expect((await call('short')).status).toBe(401);
    expect((await call()).status).toBe(401);
  });
});
