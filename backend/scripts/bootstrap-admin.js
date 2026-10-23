import { closePool } from '../lib/db.js';
import { seedInitialAdmin } from '../lib/initial-admin.js';

try {
  const seeded = await seedInitialAdmin({ syncPassword: true });
  console.log(seeded ? 'Initial administrator is ready.' : 'Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env first.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
