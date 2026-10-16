-- Enums
create type user_role           as enum ('ADMIN', 'MANAGER', 'EMPLOYEE');
create type user_status         as enum ('PENDING', 'ACTIVE', 'DISABLED');
create type campaign_status     as enum ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
create type workstream          as enum ('EMAIL', 'SEO', 'LEAD_MAGNET');
create type qualification_status as enum ('QUALIFIED', 'REJECTED', 'NEEDS_REVIEW');
create type email_task_status   as enum ('READY', 'REVIEWED', 'SENT', 'SKIPPED', 'INVALID', 'EXPIRED');
create type seo_task_status     as enum ('READY', 'REVIEWED', 'PUBLISHED', 'SKIPPED', 'INVALID', 'EXPIRED');
create type lead_task_status    as enum ('READY', 'REVIEWED', 'POSTED', 'SKIPPED', 'INVALID', 'EXPIRED');
create type evidence_type       as enum ('URL', 'TEXT', 'FILE');
create type job_kind            as enum ('NICHE_ANALYSIS', 'PROSPECT_SEARCH', 'EMAIL_GENERATION', 'SEO_GENERATION', 'LEAD_MAGNET_GENERATION');
create type job_status          as enum ('REQUESTED', 'ACCEPTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');


-- Settings (timezone, expiry, retention). Editable by Admin through the API.
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('timezone',                  '"Africa/Lagos"'),
  ('workload_generation_time',  '"00:30"'),
  ('lead_magnet_expiry_days',   '2'),
  ('body_retention_days',       '30'),
  ('require_niche_approval',    'true');

create function app_tz() returns text language sql stable as $$
  select value #>> '{}' from app_settings where key = 'timezone'
$$;

create function app_date(ts timestamptz) returns date language sql stable as $$
  select (ts at time zone app_tz())::date
$$;

create function app_today() returns date language sql stable as $$
  select app_date(now())
$$;

-- People
create table departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null,
  email          text not null unique,
  role           user_role   not null default 'EMPLOYEE',
  status         user_status not null default 'PENDING',
  department_id  uuid references departments(id),
  approved_by    uuid references profiles(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_department_idx on profiles(department_id) where status = 'ACTIVE';

-- Sign-up creates a PENDING employee. Role and status in user metadata are ignored on purpose.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
          new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helpers used by RLS. security definer so they can read profiles without recursion.
create function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'ACTIVE'
$$;

create function app_department() returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from profiles where id = auth.uid() and status = 'ACTIVE'
$$;

-- Campaigns
create table campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  niche          text not null,              -- target market the AI analyses, e.g. "Nigerian Private Schools"
  offer          text not null,              -- what is promoted, e.g. "Bearilly AI Tutor"
  location       text not null,
  objective      text not null,
  status         campaign_status not null default 'DRAFT',
  department_id  uuid not null references departments(id),  -- who works it
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- V1 rule: one ACTIVE campaign per department, so targets are never double counted per employee.
-- Drop this index if a department should run several campaigns at once.
create unique index one_active_campaign_per_department on campaigns(department_id) where status = 'ACTIVE';

create function campaign_in_my_department(p_campaign uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns c where c.id = p_campaign and c.department_id = app_department())
$$;

create table niche_profiles (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  version        int  not null default 1,
  status         text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  profile        jsonb not null,             -- the Niche Intelligence JSON, owned by the AI teammate
  approved_by    uuid references profiles(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (campaign_id, version)
);

-- Auto assignment. Rows are created from the campaign's department. A manager can switch one off.
create table campaign_assignments (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  employee_id  uuid not null references profiles(id) on delete cascade,
  active       boolean not null default true,
  source       text not null default 'AUTO' check (source in ('AUTO', 'MANUAL')),
  created_at   timestamptz not null default now(),
  unique (campaign_id, employee_id)
);

create function sync_campaign_assignments(p_campaign uuid) returns void
language plpgsql as $$
declare v_dept uuid;
begin
  select department_id into v_dept from campaigns where id = p_campaign;

  insert into campaign_assignments (campaign_id, employee_id)
  select p_campaign, p.id from profiles p
  where p.department_id = v_dept and p.role = 'EMPLOYEE' and p.status = 'ACTIVE'
  on conflict (campaign_id, employee_id) do nothing;

  -- AUTO rows for people who left the department or are no longer active get switched off
  update campaign_assignments a set active = false
  where a.campaign_id = p_campaign and a.source = 'AUTO' and a.active
    and not exists (select 1 from profiles p
                    where p.id = a.employee_id and p.department_id = v_dept
                      and p.role = 'EMPLOYEE' and p.status = 'ACTIVE');
end $$;

-- Targets (append-only). campaign_id null = global default.
create table campaign_targets (
  id                         uuid primary key default gen_random_uuid(),
  campaign_id                uuid references campaigns(id) on delete cascade,
  email_daily_target         int  not null check (email_daily_target >= 0),
  seo_daily_target           int  not null check (seo_daily_target >= 0),
  lead_magnet_daily_target   int  not null check (lead_magnet_daily_target >= 0),
  workdays_per_month         int  not null default 25 check (workdays_per_month between 1 and 31),
  effective_from             date not null,
  updated_by                 uuid references profiles(id),
  updated_at                 timestamptz not null default now()
);
create unique index campaign_targets_scope_day_uq
  on campaign_targets (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);

-- Campaign specific rows beat the global default. Within a scope, the latest effective_from wins.
create function effective_targets(p_campaign uuid, p_date date) returns campaign_targets
language sql stable as $$
  select t.* from campaign_targets t
  where t.effective_from <= p_date and (t.campaign_id = p_campaign or t.campaign_id is null)
  order by (t.campaign_id is not null) desc, t.effective_from desc, t.updated_at desc
  limit 1
$$;

-- Daily workload (immutable snapshot)
create table daily_workloads (
  id                           uuid primary key default gen_random_uuid(),
  campaign_id                  uuid not null references campaigns(id),
  employee_id                  uuid not null references profiles(id),
  work_date                    date not null,
  targets_id                   uuid not null references campaign_targets(id),
  email_target_snapshot        int not null,
  seo_target_snapshot          int not null,
  lead_magnet_target_snapshot  int not null,
  total_target_snapshot        int generated always as
    (email_target_snapshot + seo_target_snapshot + lead_magnet_target_snapshot) stored,
  carried_in_email             int not null default 0,
  carried_in_seo               int not null default 0,
  carried_in_lead_magnet       int not null default 0,
  generated_at                 timestamptz not null default now(),
  unique (campaign_id, employee_id, work_date)
);
create index daily_workloads_date_idx on daily_workloads(work_date);

-- Integration plumbing (AI and Sift teammates)
create table integration_clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  key_hash      text not null unique,          -- sha256 of the key, the key itself is shown once
  scopes        text[] not null default '{}',
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create table integration_jobs (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  kind             job_kind not null,
  status           job_status not null default 'REQUESTED',
  requested_count  int,
  delivered_count  int not null default 0,
  external_job_id  text,
  request_payload  jsonb,
  error            text,
  attempts         int not null default 0,
  requested_at     timestamptz not null default now(),
  accepted_at      timestamptz,
  completed_at     timestamptz
);
create index integration_jobs_open_idx on integration_jobs(campaign_id, kind) where status in ('REQUESTED', 'ACCEPTED', 'RUNNING');

-- Prospects (from Sift, stored by GrowthOS)
create table prospects (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  sift_id               text not null,
  organisation          text not null,
  contact_name          text,
  email                 text,
  website               text,
  industry              text,
  location              text,
  qualification_status  qualification_status not null default 'NEEDS_REVIEW',
  qualification_reason  text,
  raw                   jsonb,
  created_at            timestamptz not null default now(),
  unique (campaign_id, sift_id)
);
create unique index prospects_campaign_email_uq on prospects (campaign_id, lower(email)) where email is not null;
create index prospects_qualified_idx on prospects (campaign_id) where qualification_status = 'QUALIFIED';

-- Task tables. employee_id null = in the pool, waiting for the engine to assign it.
-- external_ref makes teammate retries safe (same ref twice = one row).
create table email_tasks (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  employee_id     uuid references profiles(id),
  prospect_id     uuid not null unique references prospects(id),
  job_id          uuid references integration_jobs(id),
  external_ref    text,
  subject         text not null,
  body            text,                          -- may be purged after retention, see purge_old_content()
  body_purged_at  timestamptz,
  status          email_task_status not null default 'READY',
  skip_reason     text,
  created_at      timestamptz not null default now(),
  assigned_at     timestamptz,
  reviewed_at     timestamptz,
  sent_at         timestamptz,
  unique (campaign_id, external_ref)
);

create table seo_tasks (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  employee_id          uuid references profiles(id),
  job_id               uuid references integration_jobs(id),
  external_ref         text,
  topic                text not null,
  primary_keyword      text not null,
  secondary_keywords   text[] not null default '{}',
  search_intent        text,
  target_audience      text,
  title                text not null,
  article              text,
  article_purged_at    timestamptz,
  meta_title           text,
  meta_description     text,
  cta                  text,
  platform             text,
  status               seo_task_status not null default 'READY',
  skip_reason          text,
  published_url        text,
  created_at           timestamptz not null default now(),
  assigned_at          timestamptz,
  reviewed_at          timestamptz,
  published_at         timestamptz,
  unique (campaign_id, external_ref)
);

create table lead_magnet_tasks (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  employee_id       uuid references profiles(id),
  job_id            uuid references integration_jobs(id),
  external_ref      text,
  platform          text not null,
  author            text,
  post_url          text not null,
  post_text         text,
  relevance_reason  text,
  comment           text not null,
  status            lead_task_status not null default 'READY',
  skip_reason       text,
  evidence_url      text,
  created_at        timestamptz not null default now(),
  assigned_at       timestamptz,
  reviewed_at       timestamptz,
  posted_at         timestamptz,
  unique (campaign_id, external_ref)
);

-- Pool lookups and employee queues
create index email_pool_idx on email_tasks (campaign_id, created_at) where employee_id is null and status = 'READY';
create index seo_pool_idx   on seo_tasks   (campaign_id, created_at) where employee_id is null and status = 'READY';
create index lead_pool_idx  on lead_magnet_tasks (campaign_id, created_at) where employee_id is null and status = 'READY';
create index email_owner_idx on email_tasks (employee_id, campaign_id, status);
create index seo_owner_idx   on seo_tasks   (employee_id, campaign_id, status);
create index lead_owner_idx  on lead_magnet_tasks (employee_id, campaign_id, status);
create index email_sent_idx  on email_tasks (employee_id, sent_at) where status = 'SENT';
create index seo_pub_idx     on seo_tasks   (employee_id, published_at) where status = 'PUBLISHED';
create index lead_post_idx   on lead_magnet_tasks (employee_id, posted_at) where status = 'POSTED';

-- Evidence
create table execution_evidence (
  id              uuid primary key default gen_random_uuid(),
  workstream      workstream not null,
  email_task_id   uuid references email_tasks(id),
  seo_task_id     uuid references seo_tasks(id),
  lead_task_id    uuid references lead_magnet_tasks(id),
  employee_id     uuid not null references profiles(id),
  evidence_type   evidence_type not null,
  evidence_value  text,                  -- URL or free text
  storage_path    text,                  -- Supabase Storage object path for FILE evidence
  created_at      timestamptz not null default now(),
  constraint evidence_one_task check
    ((email_task_id is not null)::int + (seo_task_id is not null)::int + (lead_task_id is not null)::int = 1),
  constraint evidence_matches_workstream check
    ((workstream = 'EMAIL' and email_task_id is not null)
  or (workstream = 'SEO' and seo_task_id is not null)
  or (workstream = 'LEAD_MAGNET' and lead_task_id is not null)),
  constraint evidence_has_value check (evidence_value is not null or storage_path is not null)
);
create index evidence_email_idx on execution_evidence(email_task_id) where email_task_id is not null;
create index evidence_seo_idx   on execution_evidence(seo_task_id)   where seo_task_id   is not null;
create index evidence_lead_idx  on execution_evidence(lead_task_id)  where lead_task_id  is not null;

-- Audit log (append-only)
create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                 -- from set_config('app.actor', <uuid>, true) inside the API transaction
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_entity_idx on audit_log(entity_type, entity_id);
create index audit_created_idx on audit_log(created_at);

-- Triggers
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch  before update on profiles  for each row execute function touch_updated_at();
create trigger campaigns_touch before update on campaigns for each row execute function touch_updated_at();

create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op using errcode = '42501';
end $$;

create trigger targets_append_only   before update or delete on campaign_targets   for each row execute function forbid_change();
create trigger workloads_immutable   before update or delete on daily_workloads    for each row execute function forbid_change();
create trigger evidence_immutable    before update or delete on execution_evidence for each row execute function forbid_change();
create trigger audit_append_only     before update or delete on audit_log          for each row execute function forbid_change();

-- Completed tasks are locked. Only code that sets app.amend = 'on' (admin amend, retention purge) may touch them.
create function lock_completed_task() returns trigger language plpgsql as $$
begin
  if old.status::text in ('SENT', 'PUBLISHED', 'POSTED')
     and coalesce(current_setting('app.amend', true), '') <> 'on' then
    raise exception 'completed task % is locked', old.id using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger email_lock before update or delete on email_tasks       for each row execute function lock_completed_task();
create trigger seo_lock   before update or delete on seo_tasks         for each row execute function lock_completed_task();
create trigger lead_lock  before update or delete on lead_magnet_tasks for each row execute function lock_completed_task();

-- Row level audit for configuration tables
create function audit_row() returns trigger language plpgsql as $$
declare
  rec jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (nullif(current_setting('app.actor', true), '')::uuid,
          tg_op, tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'key'),
          case when tg_op <> 'INSERT' then to_jsonb(old) - 'key_hash' end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - 'key_hash' end);
  return null;
end $$;

create trigger audit_profiles     after insert or update or delete on profiles             for each row execute function audit_row();
create trigger audit_campaigns    after insert or update or delete on campaigns            for each row execute function audit_row();
create trigger audit_targets      after insert or update or delete on campaign_targets     for each row execute function audit_row();
create trigger audit_assignments  after insert or update or delete on campaign_assignments for each row execute function audit_row();
create trigger audit_settings     after insert or update or delete on app_settings         for each row execute function audit_row();
create trigger audit_clients      after insert or update or delete on integration_clients  for each row execute function audit_row();
create trigger audit_departments  after insert or update or delete on departments          for each row execute function audit_row();

-- Tasks only log status changes. Logging full rows would put thousands of article bodies in the log every day.
create function audit_task_status() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status or old.employee_id is distinct from new.employee_id then
    insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
    values (nullif(current_setting('app.actor', true), '')::uuid,
            'UPDATE', tg_table_name, new.id::text,
            jsonb_build_object('status', old.status, 'employee_id', old.employee_id),
            jsonb_build_object('status', new.status, 'employee_id', new.employee_id));
  end if;
  return null;
end $$;

create trigger audit_email_status after update on email_tasks       for each row execute function audit_task_status();
create trigger audit_seo_status   after update on seo_tasks         for each row execute function audit_task_status();
create trigger audit_lead_status  after update on lead_magnet_tasks for each row execute function audit_task_status();

-- Ledger and report views
create view v_task_ledger with (security_invoker = true) as
  select 'EMAIL'::workstream as ws, id, campaign_id, employee_id, created_at,
         case when status = 'SENT' then 'COMPLETED'
              when status in ('READY', 'REVIEWED') then 'OPEN' else 'CLOSED' end as status_class,
         sent_at as completed_at
  from email_tasks
  union all
  select 'SEO', id, campaign_id, employee_id, created_at,
         case when status = 'PUBLISHED' then 'COMPLETED'
              when status in ('READY', 'REVIEWED') then 'OPEN' else 'CLOSED' end,
         published_at
  from seo_tasks
  union all
  select 'LEAD_MAGNET', id, campaign_id, employee_id, created_at,
         case when status = 'POSTED' then 'COMPLETED'
              when status in ('READY', 'REVIEWED') then 'OPEN' else 'CLOSED' end,
         posted_at
  from lead_magnet_tasks;

-- One row per employee, campaign and day. Targets come from the snapshot, never from current settings.
-- Completion is capped per workstream so extra emails cannot cover missing SEO articles.
create view v_daily_report with (security_invoker = true) as
  select w.id as workload_id, w.campaign_id, w.employee_id, w.work_date,
         w.email_target_snapshot, w.seo_target_snapshot, w.lead_magnet_target_snapshot, w.total_target_snapshot,
         w.carried_in_email, w.carried_in_seo, w.carried_in_lead_magnet,
         c.email_completed, c.seo_completed, c.lead_magnet_completed,
         c.email_completed + c.seo_completed + c.lead_magnet_completed as total_completed,
         round(100.0 * (least(c.email_completed, w.email_target_snapshot)
                      + least(c.seo_completed, w.seo_target_snapshot)
                      + least(c.lead_magnet_completed, w.lead_magnet_target_snapshot))
               / nullif(w.total_target_snapshot, 0), 1) as completion_pct
  from daily_workloads w
  cross join lateral (
    select count(*) filter (where l.ws = 'EMAIL')       as email_completed,
           count(*) filter (where l.ws = 'SEO')         as seo_completed,
           count(*) filter (where l.ws = 'LEAD_MAGNET') as lead_magnet_completed
    from v_task_ledger l
    where l.employee_id = w.employee_id and l.campaign_id = w.campaign_id
      and l.status_class = 'COMPLETED' and app_date(l.completed_at) = w.work_date
  ) c;

-- Unassigned work waiting per campaign (used by the pipeline to decide what to request from teammates)
create view v_pool_status with (security_invoker = true) as
  select campaign_id, ws, count(*) as pooled
  from v_task_ledger where employee_id is null and status_class = 'OPEN'
  group by campaign_id, ws;

-- Task engine. The API calls these, then talks to the AI/Sift services.
-- Nightly order: expire_stale_tasks() -> create_daily_workloads(day) -> assign_pool_tasks(day)
-- Backfill (hourly and after each delivery): assign_pool_tasks(today)
create function expire_stale_tasks() returns integer language plpgsql as $$
declare
  n int;
  days int := coalesce((select (value #>> '{}')::int from app_settings where key = 'lead_magnet_expiry_days'), 2);
begin
  update lead_magnet_tasks set status = 'EXPIRED'
  where status in ('READY', 'REVIEWED') and created_at < now() - make_interval(days => days);
  get diagnostics n = row_count;
  return n;
end $$;

create function create_daily_workloads(p_date date) returns integer language plpgsql as $$
declare
  r record;
  t campaign_targets;
  n int := 0;
  c_email int; c_seo int; c_lead int;
begin
  for r in
    select a.campaign_id, a.employee_id
    from campaign_assignments a
    join campaigns c on c.id = a.campaign_id
    join profiles p on p.id = a.employee_id
    where a.active and c.status = 'ACTIVE' and p.status = 'ACTIVE' and p.role = 'EMPLOYEE'
  loop
    t := effective_targets(r.campaign_id, p_date);
    if t.id is null then continue; end if;

    select count(*) into c_email from email_tasks
      where employee_id = r.employee_id and campaign_id = r.campaign_id and status in ('READY', 'REVIEWED');
    select count(*) into c_seo from seo_tasks
      where employee_id = r.employee_id and campaign_id = r.campaign_id and status in ('READY', 'REVIEWED');
    select count(*) into c_lead from lead_magnet_tasks
      where employee_id = r.employee_id and campaign_id = r.campaign_id and status in ('READY', 'REVIEWED');

    insert into daily_workloads (campaign_id, employee_id, work_date, targets_id,
                                 email_target_snapshot, seo_target_snapshot, lead_magnet_target_snapshot,
                                 carried_in_email, carried_in_seo, carried_in_lead_magnet)
    values (r.campaign_id, r.employee_id, p_date, t.id,
            t.email_daily_target, t.seo_daily_target, t.lead_magnet_daily_target,
            c_email, c_seo, c_lead)
    on conflict (campaign_id, employee_id, work_date) do nothing;

    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Tops every workload of the day up to its snapshot target from the pool.
-- prepared = open tasks the employee holds + tasks completed that day.
-- SKIPPED and INVALID tasks are not counted, so they get replaced.
-- Returns what is still missing so the API can request it from the AI/Sift services.
create function assign_pool_tasks(p_date date)
returns table (workload_id uuid, campaign_id uuid, employee_id uuid, ws workstream,
               target int, prepared int, assigned int, shortfall int)
language plpgsql as $$
declare
  w record;
  s workstream;
  tbl text; v_target int; v_prepared int; v_need int; v_assigned int;
begin
  for w in select * from daily_workloads d where d.work_date = p_date order by d.generated_at loop
    foreach s in array enum_range(null::workstream) loop
      tbl := case s when 'EMAIL' then 'email_tasks' when 'SEO' then 'seo_tasks' else 'lead_magnet_tasks' end;
      v_target := case s when 'EMAIL' then w.email_target_snapshot
                         when 'SEO' then w.seo_target_snapshot
                         else w.lead_magnet_target_snapshot end;

      select count(*) into v_prepared from v_task_ledger l
      where l.ws = s and l.employee_id = w.employee_id and l.campaign_id = w.campaign_id
        and (l.status_class = 'OPEN'
             or (l.status_class = 'COMPLETED' and app_date(l.completed_at) = p_date));

      v_need := greatest(v_target - v_prepared, 0);
      v_assigned := 0;

      if v_need > 0 then
        execute format($f$
          with picked as (
            select id from %1$I
            where campaign_id = $1 and employee_id is null and status = 'READY'
            order by created_at limit $2 for update skip locked)
          update %1$I t set employee_id = $3, assigned_at = now()
          from picked where t.id = picked.id $f$, tbl)
        using w.campaign_id, v_need, w.employee_id;
        get diagnostics v_assigned = row_count;
      end if;

      workload_id := w.id; campaign_id := w.campaign_id; employee_id := w.employee_id; ws := s;
      target := v_target; prepared := v_prepared + v_assigned; assigned := v_assigned;
      shortfall := greatest(v_need - v_assigned, 0);
      return next;
    end loop;
  end loop;
end $$;


create function purge_old_content() returns integer language plpgsql as $$
declare
  n1 int; n2 int;
  days int := coalesce((select (value #>> '{}')::int from app_settings where key = 'body_retention_days'), 30);
begin
  perform set_config('app.amend', 'on', true);
  update email_tasks set body = null, body_purged_at = now()
  where status = 'SENT' and body is not null and sent_at < now() - make_interval(days => days);
  get diagnostics n1 = row_count;
  update seo_tasks set article = null, article_purged_at = now()
  where status = 'PUBLISHED' and article is not null and published_at < now() - make_interval(days => days);
  get diagnostics n2 = row_count;
  perform set_config('app.amend', 'off', true);
  return n1 + n2;
end $$;

-- Row level security. Reads only. All writes go through the API.
-- Employee: own rows. Manager: own department. Admin: everything.
alter table app_settings          enable row level security;
alter table departments           enable row level security;
alter table profiles              enable row level security;
alter table campaigns             enable row level security;
alter table niche_profiles        enable row level security;
alter table campaign_assignments  enable row level security;
alter table campaign_targets      enable row level security;
alter table daily_workloads       enable row level security;
alter table integration_clients   enable row level security;
alter table integration_jobs      enable row level security;
alter table prospects             enable row level security;
alter table email_tasks           enable row level security;
alter table seo_tasks             enable row level security;
alter table lead_magnet_tasks     enable row level security;
alter table execution_evidence    enable row level security;
alter table audit_log             enable row level security;

create policy departments_read on departments for select to authenticated
  using (app_role() is not null);

create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and department_id = app_department()));

create policy campaigns_read on campaigns for select to authenticated
  using (app_role() = 'ADMIN' or department_id = app_department());

create policy niche_read on niche_profiles for select to authenticated
  using (app_role() in ('ADMIN', 'MANAGER') and (app_role() = 'ADMIN' or campaign_in_my_department(campaign_id)));

create policy assignments_read on campaign_assignments for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));

create policy targets_read on campaign_targets for select to authenticated
  using (app_role() = 'ADMIN' or (app_role() = 'MANAGER' and (campaign_id is null or campaign_in_my_department(campaign_id))));

create policy workloads_read on daily_workloads for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));

create policy prospects_read on prospects for select to authenticated
  using (app_role() = 'ADMIN' or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));

create policy email_read on email_tasks for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));
create policy seo_read on seo_tasks for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));
create policy lead_read on lead_magnet_tasks for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and campaign_in_my_department(campaign_id)));

create policy evidence_read on execution_evidence for select to authenticated
  using (employee_id = auth.uid() or app_role() = 'ADMIN'
         or (app_role() = 'MANAGER' and exists (
              select 1 from profiles p where p.id = execution_evidence.employee_id and p.department_id = app_department())));

create policy audit_read on audit_log for select to authenticated using (app_role() = 'ADMIN');
create policy settings_read on app_settings for select to authenticated using (app_role() = 'ADMIN');
-- integration_clients and integration_jobs: no policy on purpose (service connection only).

revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
