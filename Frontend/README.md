# GrowthOS frontend

GrowthOS coordinates AI-prepared work, human execution, evidence, and reporting.
The backend is the single source of truth for authentication, application data,
and the database schema. The frontend calls it through `/api`; it does not
connect to Supabase directly.

## Run locally

Start the backend first by following [`../backend/README.md`](../backend/README.md).
Then, from this directory:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The available checks are:

```bash
npm run typecheck
npm run lint
npm run build
```

## Backend and database setup

In the frontend's ignored `.env.local`, configure the backend origin:

```env
API_URL=http://localhost:4000
```

Next.js proxies `/api/*` to that backend. `NEXT_PUBLIC_API_BASE_URL` is an
optional direct-browser override and must include the `/api` path (for example,
`https://api.example.com/api`). When using that override, configure the backend
`CORS_ORIGINS` to allow the frontend origin.

The backend requires its own environment variables as documented in its
README. Apply the database migrations, in order, from the Supabase Dashboard
SQL Editor:

1. [`../backend/supabase/migrations/0001_init.sql`](../backend/supabase/migrations/0001_init.sql)
2. [`../backend/supabase/migrations/0002_frontend_feature_data.sql`](../backend/supabase/migrations/0002_frontend_feature_data.sql)

These backend migrations define the canonical schema. Do **not** apply the
deprecated `supabase/schema.sql` in this frontend; it describes an older,
incompatible data model.

New sign-ups create `EMPLOYEE` accounts in `PENDING` status and cannot sign in
until an administrator approves them. Follow the backend README's first-admin
instructions to promote the initial administrator. No Supabase credentials or
Edge Function deployment are required in the frontend.

## Product boundaries

- Email drafts are prepared and stored in GrowthOS. Employees send them using
  their approved email tool and then record that action in GrowthOS.
- Workload targets are loaded from backend configuration. Historical snapshots
  retain the target values captured at the time.
- Real SEO scanning and lead-magnet download/conversion tracking are not
  provided by the current backend; those operations remain unavailable rather
  than reporting simulated success.
- No autonomous email sending, social posting, full CRM, or unrestricted
  access to employee accounts is included.
