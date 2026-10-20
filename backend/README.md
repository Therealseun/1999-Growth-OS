# GrowthOS backend

A standalone Node API server. It lives in its own `backend/` folder beside the frontend and shares nothing with it
except the HTTP contract in `docs/openapi.yaml`. Design notes are in `docs/design.md`.

```
repo/
  src/ ...            frontend (TypeScript, untouched)
  backend/            this folder
    server.js         starts the server (port 4000)
    app.js            loads every routes/**/route.js as an endpoint under /api
    routes/           one folder per endpoint: routes/auth/login/route.js is POST /api/auth/login
    lib/              config, database, auth, role checks, error format, route wrapper
    supabase/         migration, acceptance test, local stand-in for Supabase
    tests/            72 tests, run against a real Postgres
    docs/             design.md, openapi.yaml, provider-contract.yaml
```

## Put it in the repo

1. Copy the whole `backend` folder to the repo root, next to the frontend's files. Nothing needs merging, and nothing
   of the frontend developer's is touched.
2. If the frontend's linter scans the whole repo, add `backend` to its ignore list (`.eslintignore` or the `ignores` array).
3. Commit on your own branch, not on main.

## Run it

Needs Node 20.12 or newer (`node -v`).

```
cd backend
npm install
```

1. Copy `.env.example` to `.env` and fill it in. Where each value comes from:
   - `DATABASE_URL`: Supabase dashboard, Connect, Transaction pooler (port 6543), with the database password filled in.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: Project Settings, API.
   - `SUPABASE_SERVICE_ROLE_KEY`: Project Settings, API; required to create the initial administrator.
   - `EVIDENCE_BUCKET`: private Supabase Storage bucket for task evidence (defaults to `evidence`). Configure the bucket with a 5 MiB file-size limit and allow only PNG, JPEG, WebP, and PDF files; the backend checks uploaded size and content before attaching evidence.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: credentials for the initial administrator. The account is created and activated at backend startup if it does not exist.
   - `CRON_SECRET`: run `openssl rand -hex 32`, or type any random 40 characters.
   - `CORS_ORIGINS`: the frontend address, `http://localhost:3000` for local work.
   - `DATABASE_SSL`: leave `verify`. On a certificate error, paste the CA from Database, SSL Configuration into `DATABASE_CA_CERT`.
   - If Supabase Auth reports `self-signed certificate in certificate chain`, configure Node to trust your network's verified root CA. In PowerShell, set `$env:NODE_EXTRA_CA_CERTS = 'C:\path\to\trusted-root-ca.pem'` before starting `npm run dev` or nodemon. Keep certificate verification enabled; `DATABASE_CA_CERT` only configures PostgreSQL, not HTTPS calls to Supabase.
   - On Render, the startup log identifies whether the failed certificate check was PostgreSQL or Supabase Auth. For PostgreSQL, set `DATABASE_CA_CERT` to the PEM CA certificate from your database provider. For Supabase Auth, add the verified CA as a Render Secret File and set `NODE_EXTRA_CA_CERTS` to that file's mounted path. Do not disable TLS certificate verification.
2. **Migration.** Supabase dashboard, SQL Editor, paste all of `supabase/migrations/0001_init.sql`, Run. Do not run
   `00_supabase_stub.sql`, it is only for local tests. Check with `select count(*) from app_settings;` which must return 5.
3. **Token signing.** Project Settings, JWT Keys. Leave `SUPABASE_JWT_SECRET` empty on projects with asymmetric signing keys.
   Set it only for a legacy project that still uses a shared secret.
4. **Start.** `npm run dev` or `npm start`; the backend loads `backend/.env` when present. Then open http://localhost:4000/api/health. Expect
   `{"ok":true,"database":true,"schema":true,...}`. A bad `.env` stops the server at startup and names the variable.
5. **First admin.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`, then start the backend. The configured account is created in Supabase Auth and activated as an administrator automatically. Keep the service-role key and admin password private.

In production, the host supplies real environment variables and starts the server with `npm start` (without requiring a `.env` file).

## How the frontend calls it

Pick one. Both work with this server.

- **Proxy (recommended, no CORS).** In the frontend's `next.config`, forward `/api/*` to the backend, so the browser only ever talks to the frontend's own address:
  ```js
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL}/api/:path*` }];
  }
  ```
  with `API_URL=http://localhost:4000` in the frontend's env.
- **Direct.** The frontend calls `http://localhost:4000` itself, and `CORS_ORIGINS` lists the frontend's address.
  Production needs the production frontend address added to `CORS_ORIGINS`.

TypeScript types for the frontend can be generated from the contract, from the repo root:
`npx openapi-typescript backend/docs/openapi.yaml -o src/types/api.d.ts`. Regenerate after the contract changes.

## Tests

Tests build their own throwaway database called `gos_api_test`. They never touch staging.

```
docker run -d --name gos-pg -p 5544:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
npm test
```
Use `TEST_PG_ADMIN_URL=postgres://user:pass@host:port/postgres` for a different Postgres.

## Rules for writing a route

1. Add a file `routes/<path>/route.js` (a folder named `[id]` becomes `:id`). Export `GET`, `POST`, `PATCH` or `DELETE`,
   each wrapped in `route()` from `lib/http.js`. There is nothing else to register. Never write your own try/catch or response format.
2. Every write goes through `withTransaction(session.userId, async (db) => ...)`. Without it the audit log cannot record who
   acted. Use `query()` for reads only.
3. Always use `$1, $2` parameters. Never build SQL from request values.
4. The role comes from the database (`session.profile`), never from the token or the request body.
5. Check scope with `lib/guard.js`. A record outside the caller's scope answers 404, not 403.
6. Throw `ApiError` helpers (`notFound`, `conflict`, `invalid`) for expected failures. Database rule violations are mapped for you
   (locked task gives `TASK_LOCKED`, duplicate gives `DUPLICATE`).
7. Validate with zod through the `body:` and `query:` options. Totals and calculated values are never accepted from a client.
8. Use `import ... from '../../lib/x.js'` with relative paths and the `.js` ending. There is no `@/` alias in this folder.

## Hosting

This is a long running Node process, so it needs somewhere that runs Node and stays reachable. For Render, set the service
root directory to `backend`, the build command to `npm ci`, and the start command to `npm start`. There is no backend build
step: the API runs directly from its JavaScript files. Do not use `npm build` or `npm run build`; this package has no build
script. Configure the required environment variables in Render. The scheduler (see `docs/design.md`, section 3) will call
`/api/internal/cron/*` on this server's address.

## Not verified yet

These need a real Supabase project, so they are untested:
- Token verification against the project's real JWKS endpoint (tested with generated keys instead).
- The SSL connection to the Supabase pooler.
- Sign-up through the real Supabase Auth, including the trigger on `auth.users` and the email confirmation setting. Tests replace Supabase Auth with a fake.
- The migration inside the Supabase SQL Editor. It ran on plain Postgres 16 with a stand-in for Supabase Auth.

The steps above end with a check that covers all four. Send me the result or any error it shows.
