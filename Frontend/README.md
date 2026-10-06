# 1999 GrowthOS

GrowthOS coordinates AI-prepared work, human execution, evidence, and reporting.
Sift remains the prospecting and research layer; GrowthOS does not send email or
post to social networks on an employee's behalf.

## Run locally

From `growthos-frontend`:

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

## Supabase setup

The typed service modules in `src/lib` use Supabase Auth and the Supabase
Data API. Configure these values in the ignored `.env` file, then restart the
Next.js server:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The publishable key is intended for browser use with RLS enabled. Never put a
service-role key in a `NEXT_PUBLIC_*` variable or any browser bundle.

Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase Dashboard SQL
Editor. It creates the GrowthOS tables, profile trigger, RLS policies, and safe
task-update, deactivation, and profile-update functions. If an earlier version of the schema was
already applied, rerun the current script; its table creation and policy
replacement are idempotent and it adds the functions used by this frontend.
Sign up with the account that should be the first administrator, then run the
example profile-promotion statement at the end of the SQL file.

New self-signups receive the `EMPLOYEE` role. Supabase email confirmation
settings control whether sign-up immediately creates a session or displays a
confirmation prompt. Set the Supabase Auth Site URL and redirect allow-list to
the deployed app URL.

The Employees invitation action uses the `invite-employee` Supabase Edge
Function. Deploy it with the Supabase CLI after linking this project:

```bash
supabase functions deploy invite-employee
```

The function verifies the caller is an active admin before using the
server-only Supabase service-role key to send an invitation. Do not copy that
key into `.env`, Next.js, or the frontend. The former local `/api` and JSON
store code remains for development compatibility; current application data
services use Supabase directly.

## Product boundaries

- Email drafts are prepared and stored in GrowthOS. Employees send them using
  their approved email tool and then record that action in GrowthOS.
- Workload targets are loaded from backend configuration. Historical snapshots
  retain the target values captured at the time.
- No autonomous email sending, social posting, full CRM, or unrestricted access
  to employee accounts is included.
