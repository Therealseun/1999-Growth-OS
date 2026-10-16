// Test database location. Defaults to a local Postgres on port 5544 that trusts local connections.
// Override with TEST_PG_ADMIN_URL=postgres://user:pass@host:port/postgres (a role allowed to create databases).
export const TEST_DB_NAME = 'gos_api_test';

export function adminUrl() {
  return process.env.TEST_PG_ADMIN_URL ?? 'postgres://postgres@127.0.0.1:5544/postgres';
}

export function appUrl() {
  const url = new URL(adminUrl());
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}
