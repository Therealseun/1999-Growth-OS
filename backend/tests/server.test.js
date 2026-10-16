import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, toUrlPath } from '../app.js';
import { resetConfigForTests } from '../lib/config.js';
import { createUser, resetData, shutdown, signToken } from './helpers.js';

const ORIGIN = 'http://localhost:3000';

beforeEach(resetData);
afterAll(shutdown);

async function appWith(corsOrigins) {
  if (corsOrigins === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = corsOrigins;
  resetConfigForTests();
  return createApp();
}

describe('route loading', () => {
  it('turns folder names into URLs, with [id] becoming :id', () => {
    const root = path.join('x', 'routes');
    expect(toUrlPath(root, path.join(root, 'health', 'route.js'))).toBe('/api/health');
    expect(toUrlPath(root, path.join(root, 'auth', 'login', 'route.js'))).toBe('/api/auth/login');
    expect(toUrlPath(root, path.join(root, 'email-tasks', '[id]', 'mark-sent', 'route.js'))).toBe('/api/email-tasks/:id/mark-sent');
  });

  it('serves the real routes', async () => {
    const app = await appWith(undefined);
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, schema: true });
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('passes dynamic params and dispatches by method (checked in a real Node process)', () => {
    const out = execFileSync(process.execPath, [path.join(import.meta.dirname, 'fixtures', 'dynamic-check.mjs')], {
      env: process.env,
      encoding: 'utf8',
    });
    expect(JSON.parse(out)).toEqual({
      get: { id: 'abc-123' },
      postStatus: 201,
      post: { id: '7', n: 5 },
      delStatus: 204,
    });
  });

  it('answers unknown paths and unsupported methods with the standard 404', async () => {
    const app = await appWith(undefined);
    const nope = await app.request('/api/does-not-exist');
    expect(nope.status).toBe(404);
    expect((await nope.json()).error.code).toBe('NOT_FOUND');
    expect((await app.request('/api/health', { method: 'DELETE' })).status).toBe(404);
  });

  it('runs the full auth path through the server', async () => {
    const app = await appWith(undefined);
    expect((await app.request('/api/auth/me')).status).toBe(401);
    const u = await createUser({ role: 'MANAGER' });
    const res = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${await signToken(u.id)}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: u.id, role: 'MANAGER' });
  });
});

describe('CORS', () => {
  it('answers the browser preflight for an allowed origin', async () => {
    const app = await appWith(ORIGIN);
    const res = await app.request('/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers').toLowerCase()).toContain('authorization');
  });

  it('lets the frontend read the request id and sends no allow header to other origins', async () => {
    const app = await appWith(ORIGIN);
    const ok = await app.request('/api/health', { headers: { origin: ORIGIN } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('access-control-expose-headers').toLowerCase()).toContain('x-request-id');

    const evil = await app.request('/api/health', { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('adds no CORS headers when no origins are configured', async () => {
    const app = await appWith(undefined);
    const res = await app.request('/api/health', { headers: { origin: ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('over a real HTTP server', () => {
  // The Node server replaces the global Response class. This once turned every created() into a 200 with an empty body.
  it('keeps status codes and bodies from created(), accepted() and plain returns', async () => {
    const { serve } = await import('@hono/node-server');
    resetConfigForTests();
    delete process.env.CORS_ORIGINS;
    const real = await createApp();
    const fixture = await createApp({ routesDir: path.join(import.meta.dirname, 'fixtures', 'plain') });

    const listen = (app) =>
      new Promise((resolve) => {
        const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => resolve({ server, url: `http://127.0.0.1:${info.port}` }));
      });
    const a = await listen(real);
    const b = await listen(fixture);
    try {
      const health = await fetch(`${a.url}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, schema: true });

      const post = await fetch(`${b.url}/api/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n: 4 }) });
      expect(post.status).toBe(201);
      expect(await post.json()).toEqual({ n: 4 });

      const put = await fetch(`${b.url}/api/status`, { method: 'PUT' });
      expect(put.status).toBe(202);
      expect(await put.json()).toEqual({ queued: true });
      expect(put.headers.get('x-request-id')).toBeTruthy();
    } finally {
      a.server.close();
      b.server.close();
    }
  });
});
