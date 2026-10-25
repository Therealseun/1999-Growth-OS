import { closePool } from '../lib/db.js';
import { seedInitialAccounts } from '../lib/initial-admin.js';

try {
  const seeded = await seedInitialAccounts({ syncPassword: true });
  console.log(seeded
    ? 'Configured initial accounts are ready.'
    : 'Set ADMIN_EMAIL/ADMIN_PASSWORD and/or MANAGER_EMAIL/MANAGER_PASSWORD in backend/.env first.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
