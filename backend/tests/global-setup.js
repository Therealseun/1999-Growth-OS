import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { TEST_DB_NAME, adminUrl, appUrl } from './env.js';

// Builds a fresh database for every test run: Supabase stand-in first, then the real migrations.
export default async function setup() {
  const root = path.resolve(import.meta.dirname, '..');
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB_NAME} with (force)`);
  await admin.query(`create database ${TEST_DB_NAME}`);
  await admin.end();

  const db = new pg.Client({ connectionString: appUrl() });
  await db.connect();
  for (const file of [
    'supabase/tests/00_supabase_stub.sql',
    'supabase/migrations/0001_init.sql',
    'supabase/migrations/0002_frontend_feature_data.sql',
  ]) {
    await db.query(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  await db.end();
}
