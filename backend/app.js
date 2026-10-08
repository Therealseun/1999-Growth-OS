import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getConfig } from './lib/config.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function* routeFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* routeFiles(full);
    else if (entry.name === 'route.js') yield full;
  }
}

export function toUrlPath(routesDir, file) {
  const segments = path.relative(routesDir, path.dirname(file)).split(path.sep).filter(Boolean);
  return `/api/${segments.map((s) => s.replace(/^\[(.+)\]$/, ':$1')).join('/')}`.replace(/\/$/, '');
}

export async function createApp({ routesDir = path.join(import.meta.dirname, 'routes') } = {}) {
  const app = new Hono();

  const origins = (getConfig().CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.use(
      '/api/*',
      cors({
        origin: origins,
        allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type', 'X-Integration-Key'],
        exposeHeaders: ['x-request-id'],
        maxAge: 600,
      }),
    );
  }

  const files = [...routeFiles(routesDir)].sort();
  for (const file of files) {
    const urlPath = toUrlPath(routesDir, file);
    const mod = await import(pathToFileURL(file).href);
    for (const method of METHODS) {
      if (typeof mod[method] === 'function') {
        app.on(method, urlPath, (c) => mod[method](c.req.raw, { params: c.req.param() }));
      }
    }
  }

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));
  app.onError((err, c) => {
    console.error(JSON.stringify({ level: 'error', message: err?.message, stack: err?.stack }));
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
  });
  return app;
}
