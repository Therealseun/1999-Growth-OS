-- GrowthOS Supabase schema.
-- Run in Supabase Dashboard > SQL Editor. Public browser access uses the
-- publishable key and these RLS policies; never put a service-role key in Next.js.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'EMPLOYEE' check (role in ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text not null,
  target_audience text not null,
  objective text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  owner_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  email text not null,
  company text,
  job_title text,
  source text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'SEED' check (status in ('SEED', 'CONTACTED', 'QUALIFIED', 'CONVERTED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists prospects_email_lower_uidx on public.prospects(lower(email));

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('EMAIL', 'SEO', 'LEAD_MAGNET')),
  title text not null,
  description text,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
  assigned_to uuid not null references public.profiles(id),
  assigned_by uuid default auth.uid() references public.profiles(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  priority text check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  type text not null check (type in ('LINK', 'SCREENSHOT', 'NOTE', 'FILE')),
  title text not null,
  url text,
  metadata jsonb,
  submitted_by uuid not null default auth.uid() references public.profiles(id),
  submitted_at timestamptz not null default now()
);

create table if not exists public.workload_targets (
  id uuid primary key default gen_random_uuid(),
  role text not null unique check (role in ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  daily_task_target integer not null check (daily_task_target >= 0),
  weekly_task_target integer not null check (weekly_task_target >= 0),
  active_campaigns_target integer check (active_campaigns_target >= 0),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workload_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period in ('TODAY', 'THIS_WEEK', 'THIS_MONTH')),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  tasks_assigned integer not null default 0 check (tasks_assigned >= 0),
  target_snapshot jsonb not null check (
    target_snapshot ? 'dailyTaskTarget'
    and target_snapshot ? 'weeklyTaskTarget'
    and target_snapshot ? 'activeCampaignsTarget'
  ),
  captured_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  type text not null default 'OUTREACH',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  prospect_ids uuid[] not null default '{}',
  sent_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_audits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  overall_score numeric(5, 2) check (overall_score between 0 and 100),
  categories jsonb not null default '{}',
  recommendations jsonb not null default '[]',
  errors jsonb not null default '[]',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_magnets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'pdf',
  description text not null default '',
  content text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  download_count integer not null default 0 check (download_count >= 0),
  conversion_rate numeric(6, 2) not null default 0 check (conversion_rate >= 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('PIPELINE', 'PERFORMANCE', 'TASK_AUDIT')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  date_from date,
  date_to date,
  format text not null default 'CSV' check (format in ('CSV', 'JSON')),
  status text not null default 'READY' check (status in ('QUEUED', 'READY', 'FAILED')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (date_from is null or date_to is null or date_from <= date_to)
);

create table if not exists public.campaign_niche_intelligence (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  insights jsonb not null default '[]',
  opportunities jsonb not null default '[]',
  risks jsonb not null default '[]',
  competitors jsonb not null default '[]',
  researched_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists prospects_campaign_status_idx on public.prospects(campaign_id, status);
create index if not exists tasks_assigned_status_idx on public.tasks(assigned_to, status);
create index if not exists tasks_campaign_created_idx on public.tasks(campaign_id, created_at desc);
create index if not exists evidence_task_submitted_idx on public.task_evidence(task_id, submitted_at desc);
create index if not exists snapshots_user_captured_idx on public.workload_snapshots(user_id, captured_at desc);
create index if not exists email_drafts_owner_created_idx on public.email_drafts(created_by, created_at desc);
create index if not exists reports_owner_created_idx on public.reports(created_by, created_at desc);

create or replace function public.growthos_current_role()
returns text language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
$$;

create or replace function public.growthos_is_manager()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(public.growthos_current_role() in ('ADMIN', 'MANAGER'), false)
$$;

create or replace function public.growthos_set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.growthos_create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
    updated_at = now();
  return new;
end;
$$;

create or replace function public.growthos_guard_task_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    new.completed_at = now();
  elsif new.status <> 'COMPLETED' then
    new.completed_at = null;
  end if;
  if public.growthos_current_role() = 'EMPLOYEE'
    and (
      new.id is distinct from old.id
      or new.type is distinct from old.type
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.assigned_to is distinct from old.assigned_to
      or new.assigned_by is distinct from old.assigned_by
      or new.campaign_id is distinct from old.campaign_id
      or new.due_date is distinct from old.due_date
      or new.priority is distinct from old.priority
      or new.created_at is distinct from old.created_at
      or (old.status = 'COMPLETED' and new.completed_at is distinct from old.completed_at)
    )
  then
    raise exception 'Employees may only update task status and completion time'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.growthos_deactivate_user(target_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.growthos_current_role() is distinct from 'ADMIN' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_id = (select auth.uid()) then
    raise exception 'Administrators cannot deactivate their own account' using errcode = '22023';
  end if;
  update public.profiles set active = false where id = target_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.growthos_update_own_name(new_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.growthos_current_role() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if new_name is null or length(trim(new_name)) not between 1 and 120 then
    raise exception 'Name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  update public.profiles
  set full_name = trim(new_name)
  where id = (select auth.uid());
end;
$$;

create or replace function public.growthos_capture_workload_snapshot()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  user_role text;
  target public.workload_targets%rowtype;
  period_name text;
  period_start timestamptz;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then
    return new;
  end if;

  select p.role into user_role
  from public.profiles p
  where p.id = new.assigned_to and p.active = true;
  if user_role is null then
    return new;
  end if;

  select * into target from public.workload_targets wt where wt.role = user_role;
  if not found then
    return new;
  end if;

  foreach period_name in array array['TODAY', 'THIS_WEEK', 'THIS_MONTH'] loop
    period_start := now() - case period_name
      when 'TODAY' then interval '1 day'
      when 'THIS_WEEK' then interval '7 days'
      else interval '30 days'
    end;

    insert into public.workload_snapshots (
      user_id, period, tasks_completed, tasks_assigned, target_snapshot
    )
    select
      new.assigned_to,
      period_name,
      count(*) filter (where t.status = 'COMPLETED' and t.completed_at >= period_start),
      count(*) filter (where t.created_at >= period_start),
      jsonb_build_object(
        'dailyTaskTarget', target.daily_task_target,
        'weeklyTaskTarget', target.weekly_task_target,
        'activeCampaignsTarget', target.active_campaigns_target
      )
    from public.tasks t
    where t.assigned_to = new.assigned_to
      and (t.created_at >= period_start or (t.status = 'COMPLETED' and t.completed_at >= period_start));
  end loop;
  return new;
end;
$$;

drop trigger if exists growthos_auth_user_created on auth.users;
create trigger growthos_auth_user_created after insert on auth.users
for each row execute function public.growthos_create_profile();
drop trigger if exists growthos_task_update_guard on public.tasks;
create trigger growthos_task_update_guard before update on public.tasks
for each row execute function public.growthos_guard_task_update();
drop trigger if exists growthos_task_workload_snapshot on public.tasks;
create trigger growthos_task_workload_snapshot after update of status on public.tasks
for each row execute function public.growthos_capture_workload_snapshot();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','campaigns','prospects','tasks','task_evidence','workload_targets',
    'workload_snapshots','email_templates','email_drafts','seo_audits',
    'lead_magnets','reports','campaign_niche_intelligence'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    if table_name not in ('task_evidence','workload_snapshots','reports','seo_audits') then
      execute format('drop trigger if exists growthos_updated_at on public.%I', table_name);
      execute format('create trigger growthos_updated_at before update on public.%I for each row execute function public.growthos_set_updated_at()', table_name);
    end if;
  end loop;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.campaigns, public.prospects,
  public.tasks, public.task_evidence, public.workload_targets, public.workload_snapshots,
  public.email_templates, public.email_drafts, public.seo_audits, public.lead_magnets,
  public.reports, public.campaign_niche_intelligence to authenticated;
grant all on public.profiles, public.campaigns, public.prospects, public.tasks,
  public.task_evidence, public.workload_targets, public.workload_snapshots,
  public.email_templates, public.email_drafts, public.seo_audits, public.lead_magnets,
  public.reports, public.campaign_niche_intelligence to service_role;
revoke all on function public.growthos_deactivate_user(uuid) from public;
grant execute on function public.growthos_deactivate_user(uuid) to authenticated;
revoke all on function public.growthos_update_own_name(text) from public;
grant execute on function public.growthos_update_own_name(text) to authenticated;

drop policy if exists "Profiles readable by self and managers" on public.profiles;
create policy "Profiles readable by self and managers" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.growthos_is_manager());
drop policy if exists "Admins manage profiles" on public.profiles;
drop policy if exists "Managers manage profiles" on public.profiles;
create policy "Admins insert profiles" on public.profiles
for insert to authenticated with check (public.growthos_current_role() = 'ADMIN');
drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles" on public.profiles
for update to authenticated using (public.growthos_current_role() = 'ADMIN')
with check (public.growthos_current_role() = 'ADMIN');
drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Admins delete profiles" on public.profiles
for delete to authenticated using (public.growthos_current_role() = 'ADMIN');

drop policy if exists "Authenticated users read campaigns" on public.campaigns;
create policy "Authenticated users read campaigns" on public.campaigns
for select to authenticated using (public.growthos_current_role() is not null);
drop policy if exists "Managers create campaigns" on public.campaigns;
create policy "Managers create campaigns" on public.campaigns
for insert to authenticated with check (public.growthos_is_manager() and owner_id = (select auth.uid()));
drop policy if exists "Managers update campaigns" on public.campaigns;
create policy "Managers update campaigns" on public.campaigns
for update to authenticated using (public.growthos_is_manager()) with check (public.growthos_is_manager());
drop policy if exists "Admins delete campaigns" on public.campaigns;
create policy "Admins delete campaigns" on public.campaigns
for delete to authenticated using (public.growthos_current_role() = 'ADMIN');

drop policy if exists "Managers manage prospects" on public.prospects;
create policy "Managers manage prospects" on public.prospects
for all to authenticated using (public.growthos_is_manager()) with check (public.growthos_is_manager());

drop policy if exists "Users read assigned tasks" on public.tasks;
create policy "Users read assigned tasks" on public.tasks
for select to authenticated using (assigned_to = (select auth.uid()) or public.growthos_is_manager());
drop policy if exists "Managers create tasks" on public.tasks;
create policy "Managers create tasks" on public.tasks
for insert to authenticated with check (public.growthos_is_manager());
drop policy if exists "Assignees and managers update tasks" on public.tasks;
create policy "Assignees and managers update tasks" on public.tasks
for update to authenticated using (assigned_to = (select auth.uid()) or public.growthos_is_manager())
with check (assigned_to = (select auth.uid()) or public.growthos_is_manager());
drop policy if exists "Managers delete tasks" on public.tasks;
create policy "Managers delete tasks" on public.tasks
for delete to authenticated using (public.growthos_is_manager());

drop policy if exists "Users read task evidence" on public.task_evidence;
create policy "Users read task evidence" on public.task_evidence
for select to authenticated using (
  submitted_by = (select auth.uid()) or public.growthos_is_manager()
  or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = (select auth.uid()))
);
drop policy if exists "Assignees submit evidence" on public.task_evidence;
create policy "Assignees submit evidence" on public.task_evidence
for insert to authenticated with check (
  submitted_by = (select auth.uid()) and
  (public.growthos_is_manager() or exists (
    select 1 from public.tasks t where t.id = task_id and t.assigned_to = (select auth.uid())
  ))
);
drop policy if exists "Managers delete evidence" on public.task_evidence;
create policy "Managers delete evidence" on public.task_evidence
for delete to authenticated using (public.growthos_is_manager());

drop policy if exists "Admins read workload targets" on public.workload_targets;
create policy "Admins read workload targets" on public.workload_targets
for select to authenticated using (public.growthos_current_role() = 'ADMIN');
drop policy if exists "Admins manage workload targets" on public.workload_targets;
create policy "Admins manage workload targets" on public.workload_targets
for all to authenticated using (public.growthos_current_role() = 'ADMIN')
with check (public.growthos_current_role() = 'ADMIN');
drop policy if exists "Users read own snapshots" on public.workload_snapshots;
create policy "Users read own snapshots" on public.workload_snapshots
for select to authenticated using (user_id = (select auth.uid()) or public.growthos_current_role() = 'ADMIN');

drop policy if exists "Authenticated users read email templates" on public.email_templates;
create policy "Authenticated users read email templates" on public.email_templates
for select to authenticated using (public.growthos_current_role() is not null);
drop policy if exists "Users manage own email templates" on public.email_templates;
create policy "Users manage own email templates" on public.email_templates
for all to authenticated using (created_by = (select auth.uid()) or public.growthos_is_manager())
with check (created_by = (select auth.uid()) or public.growthos_is_manager());

drop policy if exists "Users read own drafts" on public.email_drafts;
create policy "Users read own drafts" on public.email_drafts
for select to authenticated using (created_by = (select auth.uid()) or public.growthos_is_manager());
drop policy if exists "Users manage own drafts" on public.email_drafts;
create policy "Users manage own drafts" on public.email_drafts
for all to authenticated using (created_by = (select auth.uid()) or public.growthos_is_manager())
with check (created_by = (select auth.uid()) or public.growthos_is_manager());

drop policy if exists "Authenticated users read SEO audits" on public.seo_audits;
create policy "Authenticated users read SEO audits" on public.seo_audits
for select to authenticated using (public.growthos_current_role() is not null);
drop policy if exists "Users create SEO audits" on public.seo_audits;
create policy "Users create SEO audits" on public.seo_audits
for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "Authenticated users read lead magnets" on public.lead_magnets;
create policy "Authenticated users read lead magnets" on public.lead_magnets
for select to authenticated using (public.growthos_current_role() is not null);
drop policy if exists "Users manage own lead magnets" on public.lead_magnets;
create policy "Users manage own lead magnets" on public.lead_magnets
for all to authenticated using (created_by = (select auth.uid()) or public.growthos_is_manager())
with check (created_by = (select auth.uid()) or public.growthos_is_manager());

drop policy if exists "Users read own reports" on public.reports;
create policy "Users read own reports" on public.reports
for select to authenticated using (created_by = (select auth.uid()) or public.growthos_is_manager());
drop policy if exists "Users create own reports" on public.reports;
create policy "Users create own reports" on public.reports
for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "Authenticated users read niche intelligence" on public.campaign_niche_intelligence;
create policy "Authenticated users read niche intelligence" on public.campaign_niche_intelligence
for select to authenticated using (public.growthos_current_role() is not null);
drop policy if exists "Managers manage niche intelligence" on public.campaign_niche_intelligence;
create policy "Managers manage niche intelligence" on public.campaign_niche_intelligence
for all to authenticated using (public.growthos_is_manager()) with check (public.growthos_is_manager());

-- After signing up with your admin email, promote that profile from the SQL
-- Editor using a parameterized email value:
-- update public.profiles set role = 'ADMIN' where lower(email) = lower('you@company.com');
