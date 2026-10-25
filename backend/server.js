import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closePool } from './lib/db.js';
import { getConfig } from './lib/config.js';
import { seedInitialAccounts } from './lib/initial-admin.js';
import { checkBase } from './shared/db.js';

let config;
try {
  config = getConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const { PORT } = config;
try {
  if (config.GROWTHOS_SCHEMA === 'shared') {
    await checkBase();
  } else {
    await seedInitialAccounts();
  }
} catch (err) {
  const phase = config.GROWTHOS_SCHEMA === 'shared'
    ? 'Shared database validation failed'
    : 'Initial account setup failed';
  console.error(`${phase}: ${err.message}`);
  await closePool();
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
