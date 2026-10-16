// Runs in a real Node process (not the test runner) so route loading is checked the way production runs it.
import path from 'node:path';
import { createApp } from '../../app.js';

const app = await createApp({ routesDir: path.join(import.meta.dirname, 'routes') });
const get = await app.request('/api/things/abc-123');
const post = await app.request('/api/things/7', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ n: 5 }),
});
const del = await app.request('/api/things/7', { method: 'DELETE' });
console.log(JSON.stringify({ get: await get.json(), postStatus: post.status, post: await post.json(), delStatus: del.status }));
