import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closePool } from './lib/db.js';
import { getConfig } from './lib/config.js';

let PORT;
try {
  ({ PORT } = getConfig());
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const app = await createApp();
const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`GrowthOS API listening on http://localhost:${info.port}`);
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
