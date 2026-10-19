-- TEST FIXTURE ONLY. Structural export supplied 2026-10-13. No customer rows.

-- Auth roles/function and table grants are test scaffolding; grants were not in the export.

create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');

create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;

create table public."campaign_niche_intelligence" (
 "campaign_id" uuid not null,
 "insights" jsonb default '[]'::jsonb not null,
 "opportunities" jsonb default '[]'::jsonb not null,
 "risks" jsonb default '[]'::jsonb not null,
 "competitors" jsonb default '[]'::jsonb not null,
 "researched_at" timestamptz,
 "updated_at" timestamptz default now() not null
);

create table public."campaigns" (
 "id" uuid default gen_random_uuid() not null,
 "name" text not null,
 "niche" text not null,
 "target_audience" text not null,
 "objective" text default ''::text not null,
 "status" text default 'DRAFT'::text not null,
 "owner_id" uuid default auth.uid() not null,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."email_drafts" (
 "id" uuid default gen_random_uuid() not null,
 "subject" text not null,
 "body" text default ''::text not null,
 "status" text default 'DRAFT'::text not null,
 "campaign_id" uuid,
 "prospect_ids" uuid[] default '{}'::uuid[] not null,
 "sent_at" timestamptz,
 "created_by" uuid default auth.uid() not null,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."email_templates" (
 "id" uuid default gen_random_uuid() not null,
 "name" text not null,
 "subject" text default ''::text not null,
 "body" text default ''::text not null,
 "type" text default 'OUTREACH'::text not null,
 "created_by" uuid default auth.uid() not null,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."lead_magnets" (
 "id" uuid default gen_random_uuid() not null,
 "name" text not null,
 "type" text default 'pdf'::text not null,
 "description" text default ''::text not null,
 "content" text,
 "status" text default 'DRAFT'::text not null,
 "campaign_id" uuid,
 "download_count" int4 default 0 not null,
 "conversion_rate" numeric default 0 not null,
 "created_by" uuid default auth.uid(),
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."profiles" (
 "id" uuid not null,
 "email" text not null,
 "full_name" text default ''::text not null,
 "role" text default 'EMPLOYEE'::text not null,
 "active" bool default true not null,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."prospects" (
 "id" uuid default gen_random_uuid() not null,
 "first_name" text not null,
 "last_name" text default ''::text not null,
 "email" text not null,
 "company" text,
 "job_title" text,
 "source" text,
 "campaign_id" uuid,
 "status" text default 'SEED'::text not null,
 "notes" text,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."reports" (
 "id" uuid default gen_random_uuid() not null,
 "type" text not null,
 "campaign_id" uuid,
 "date_from" date,
 "date_to" date,
 "format" text default 'CSV'::text not null,
 "status" text default 'READY'::text not null,
 "created_by" uuid default auth.uid() not null,
 "created_at" timestamptz default now() not null
);

create table public."seo_audits" (
 "id" uuid default gen_random_uuid() not null,
 "campaign_id" uuid not null,
 "overall_score" numeric,
 "categories" jsonb default '{}'::jsonb not null,
 "recommendations" jsonb default '[]'::jsonb not null,
 "errors" jsonb default '[]'::jsonb not null,
 "created_by" uuid default auth.uid(),
 "created_at" timestamptz default now() not null
);

create table public."task_evidence" (
 "id" uuid default gen_random_uuid() not null,
 "task_id" uuid not null,
 "type" text not null,
 "title" text not null,
 "url" text,
 "metadata" jsonb,
 "submitted_by" uuid default auth.uid() not null,
 "submitted_at" timestamptz default now() not null
);

create table public."tasks" (
 "id" uuid default gen_random_uuid() not null,
 "type" text not null,
 "title" text not null,
 "description" text,
 "status" text default 'PENDING'::text not null,
 "assigned_to" uuid not null,
 "assigned_by" uuid default auth.uid(),
 "campaign_id" uuid,
 "due_date" timestamptz,
 "completed_at" timestamptz,
 "priority" text,
 "created_at" timestamptz default now() not null,
 "updated_at" timestamptz default now() not null
);

create table public."workload_snapshots" (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "period" text not null,
 "tasks_completed" int4 default 0 not null,
 "tasks_assigned" int4 default 0 not null,
 "target_snapshot" jsonb not null,
 "captured_at" timestamptz default now() not null
);

create table public."workload_targets" (
 "id" uuid default gen_random_uuid() not null,
 "role" text not null,
 "daily_task_target" int4 not null,
 "weekly_task_target" int4 not null,
 "active_campaigns_target" int4,
 "updated_by" uuid default auth.uid(),
 "updated_at" timestamptz default now() not null
);

alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text, 'EMPLOYEE'::text])));

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_email_key" UNIQUE (email);

alter table public."campaigns" add constraint "campaigns_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'PAUSED'::text, 'COMPLETED'::text])));

alter table public."campaigns" add constraint "campaigns_pkey" PRIMARY KEY (id);

alter table public."prospects" add constraint "prospects_status_check" CHECK ((status = ANY (ARRAY['SEED'::text, 'CONTACTED'::text, 'QUALIFIED'::text, 'CONVERTED'::text])));

alter table public."prospects" add constraint "prospects_pkey" PRIMARY KEY (id);

alter table public."tasks" add constraint "tasks_type_check" CHECK ((type = ANY (ARRAY['EMAIL'::text, 'SEO'::text, 'LEAD_MAGNET'::text])));

alter table public."tasks" add constraint "tasks_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'BLOCKED'::text])));

alter table public."tasks" add constraint "tasks_priority_check" CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text])));

alter table public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);

alter table public."task_evidence" add constraint "task_evidence_type_check" CHECK ((type = ANY (ARRAY['LINK'::text, 'SCREENSHOT'::text, 'NOTE'::text, 'FILE'::text])));

alter table public."task_evidence" add constraint "task_evidence_pkey" PRIMARY KEY (id);

alter table public."workload_targets" add constraint "workload_targets_role_check" CHECK ((role = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text, 'EMPLOYEE'::text])));

alter table public."workload_targets" add constraint "workload_targets_daily_task_target_check" CHECK ((daily_task_target >= 0));

alter table public."workload_targets" add constraint "workload_targets_weekly_task_target_check" CHECK ((weekly_task_target >= 0));

alter table public."workload_targets" add constraint "workload_targets_active_campaigns_target_check" CHECK ((active_campaigns_target >= 0));

alter table public."workload_targets" add constraint "workload_targets_pkey" PRIMARY KEY (id);

alter table public."workload_targets" add constraint "workload_targets_role_key" UNIQUE (role);

alter table public."workload_snapshots" add constraint "workload_snapshots_period_check" CHECK ((period = ANY (ARRAY['TODAY'::text, 'THIS_WEEK'::text, 'THIS_MONTH'::text])));

alter table public."workload_snapshots" add constraint "workload_snapshots_tasks_completed_check" CHECK ((tasks_completed >= 0));

alter table public."workload_snapshots" add constraint "workload_snapshots_tasks_assigned_check" CHECK ((tasks_assigned >= 0));

alter table public."workload_snapshots" add constraint "workload_snapshots_target_snapshot_check" CHECK (((target_snapshot ? 'dailyTaskTarget'::text) AND (target_snapshot ? 'weeklyTaskTarget'::text) AND (target_snapshot ? 'activeCampaignsTarget'::text)));

alter table public."workload_snapshots" add constraint "workload_snapshots_pkey" PRIMARY KEY (id);

alter table public."email_templates" add constraint "email_templates_pkey" PRIMARY KEY (id);

alter table public."email_drafts" add constraint "email_drafts_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SENT'::text])));

alter table public."email_drafts" add constraint "email_drafts_pkey" PRIMARY KEY (id);

alter table public."seo_audits" add constraint "seo_audits_overall_score_check" CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)));

alter table public."seo_audits" add constraint "seo_audits_pkey" PRIMARY KEY (id);

alter table public."lead_magnets" add constraint "lead_magnets_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])));

alter table public."lead_magnets" add constraint "lead_magnets_download_count_check" CHECK ((download_count >= 0));

alter table public."lead_magnets" add constraint "lead_magnets_conversion_rate_check" CHECK ((conversion_rate >= (0)::numeric));

alter table public."lead_magnets" add constraint "lead_magnets_pkey" PRIMARY KEY (id);

alter table public."reports" add constraint "reports_type_check" CHECK ((type = ANY (ARRAY['PIPELINE'::text, 'PERFORMANCE'::text, 'TASK_AUDIT'::text])));

alter table public."reports" add constraint "reports_format_check" CHECK ((format = ANY (ARRAY['CSV'::text, 'JSON'::text])));

alter table public."reports" add constraint "reports_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'READY'::text, 'FAILED'::text])));

alter table public."reports" add constraint "reports_check" CHECK (((date_from IS NULL) OR (date_to IS NULL) OR (date_from <= date_to)));

alter table public."reports" add constraint "reports_pkey" PRIMARY KEY (id);

alter table public."campaign_niche_intelligence" add constraint "campaign_niche_intelligence_pkey" PRIMARY KEY (campaign_id);

alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."campaigns" add constraint "campaigns_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id);

alter table public."prospects" add constraint "prospects_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

alter table public."tasks" add constraint "tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES profiles(id);

alter table public."tasks" add constraint "tasks_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."tasks" add constraint "tasks_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

alter table public."task_evidence" add constraint "task_evidence_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

alter table public."task_evidence" add constraint "task_evidence_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id);

alter table public."workload_targets" add constraint "workload_targets_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."workload_snapshots" add constraint "workload_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."email_templates" add constraint "email_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

alter table public."email_drafts" add constraint "email_drafts_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

alter table public."email_drafts" add constraint "email_drafts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

alter table public."seo_audits" add constraint "seo_audits_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

alter table public."seo_audits" add constraint "seo_audits_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."lead_magnets" add constraint "lead_magnets_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

alter table public."lead_magnets" add constraint "lead_magnets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."reports" add constraint "reports_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

alter table public."reports" add constraint "reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

alter table public."campaign_niche_intelligence" add constraint "campaign_niche_intelligence_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX campaigns_status_idx ON public.campaigns USING btree (status);

CREATE UNIQUE INDEX prospects_email_lower_uidx ON public.prospects USING btree (lower(email));

CREATE INDEX prospects_campaign_status_idx ON public.prospects USING btree (campaign_id, status);

CREATE INDEX tasks_assigned_status_idx ON public.tasks USING btree (assigned_to, status);

CREATE INDEX tasks_campaign_created_idx ON public.tasks USING btree (campaign_id, created_at DESC);

CREATE INDEX evidence_task_submitted_idx ON public.task_evidence USING btree (task_id, submitted_at DESC);

CREATE INDEX snapshots_user_captured_idx ON public.workload_snapshots USING btree (user_id, captured_at DESC);

CREATE INDEX email_drafts_owner_created_idx ON public.email_drafts USING btree (created_by, created_at DESC);

CREATE INDEX reports_owner_created_idx ON public.reports USING btree (created_by, created_at DESC);

CREATE OR REPLACE FUNCTION public.growthos_capture_workload_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_create_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_deactivate_user(target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_guard_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(public.growthos_current_role() in ('ADMIN', 'MANAGER'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.growthos_update_own_name(new_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.seo_audits FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION growthos_create_profile();

CREATE TRIGGER growthos_task_update_guard BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION growthos_guard_task_update();

CREATE TRIGGER growthos_task_workload_snapshot AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION growthos_capture_workload_snapshot();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.prospects FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.workload_targets FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.lead_magnets FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

CREATE TRIGGER growthos_updated_at BEFORE UPDATE ON public.campaign_niche_intelligence FOR EACH ROW EXECUTE FUNCTION growthos_set_updated_at();

create policy "Managers manage SEO audits" on public."seo_audits" as PERMISSIVE for UPDATE to "authenticated" using (growthos_is_manager()) with check (growthos_is_manager());

create policy "Managers delete SEO audits" on public."seo_audits" as PERMISSIVE for DELETE to "authenticated" using (growthos_is_manager());

create policy "Owners and managers manage email templates" on public."email_templates" as PERMISSIVE for ALL to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Owners and managers manage email drafts" on public."email_drafts" as PERMISSIVE for ALL to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Authenticated users create SEO audits" on public."seo_audits" as PERMISSIVE for INSERT to "authenticated" with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Authenticated users create lead magnets" on public."lead_magnets" as PERMISSIVE for INSERT to "authenticated" with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Owners and managers update lead magnets" on public."lead_magnets" as PERMISSIVE for UPDATE to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Managers delete lead magnets" on public."lead_magnets" as PERMISSIVE for DELETE to "authenticated" using (growthos_is_manager());

create policy "Managers read reports" on public."reports" as PERMISSIVE for SELECT to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Managers create reports" on public."reports" as PERMISSIVE for INSERT to "authenticated" with check ((growthos_is_manager() AND (created_by = ( SELECT auth.uid() AS uid))));

create policy "Managers update reports" on public."reports" as PERMISSIVE for UPDATE to "authenticated" using (growthos_is_manager()) with check (growthos_is_manager());

create policy "Managers delete reports" on public."reports" as PERMISSIVE for DELETE to "authenticated" using (growthos_is_manager());

create policy "Profiles readable by self and managers" on public."profiles" as PERMISSIVE for SELECT to "authenticated" using (((id = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Admins insert profiles" on public."profiles" as PERMISSIVE for INSERT to "authenticated" with check ((growthos_current_role() = 'ADMIN'::text));

create policy "Admins update profiles" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((growthos_current_role() = 'ADMIN'::text)) with check ((growthos_current_role() = 'ADMIN'::text));

create policy "Admins delete profiles" on public."profiles" as PERMISSIVE for DELETE to "authenticated" using ((growthos_current_role() = 'ADMIN'::text));

create policy "Authenticated users read campaigns" on public."campaigns" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() IS NOT NULL));

create policy "Managers create campaigns" on public."campaigns" as PERMISSIVE for INSERT to "authenticated" with check ((growthos_is_manager() AND (owner_id = ( SELECT auth.uid() AS uid))));

create policy "Managers update campaigns" on public."campaigns" as PERMISSIVE for UPDATE to "authenticated" using (growthos_is_manager()) with check (growthos_is_manager());

create policy "Admins delete campaigns" on public."campaigns" as PERMISSIVE for DELETE to "authenticated" using ((growthos_current_role() = 'ADMIN'::text));

create policy "Managers manage prospects" on public."prospects" as PERMISSIVE for ALL to "authenticated" using (growthos_is_manager()) with check (growthos_is_manager());

create policy "Users read assigned tasks" on public."tasks" as PERMISSIVE for SELECT to "authenticated" using (((assigned_to = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Managers create tasks" on public."tasks" as PERMISSIVE for INSERT to "authenticated" with check (growthos_is_manager());

create policy "Assignees and managers update tasks" on public."tasks" as PERMISSIVE for UPDATE to "authenticated" using (((assigned_to = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((assigned_to = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Managers delete tasks" on public."tasks" as PERMISSIVE for DELETE to "authenticated" using (growthos_is_manager());

create policy "Users read task evidence" on public."task_evidence" as PERMISSIVE for SELECT to "authenticated" using (((submitted_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager() OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_evidence.task_id) AND (t.assigned_to = ( SELECT auth.uid() AS uid)))))));

create policy "Assignees submit evidence" on public."task_evidence" as PERMISSIVE for INSERT to "authenticated" with check (((submitted_by = ( SELECT auth.uid() AS uid)) AND (growthos_is_manager() OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_evidence.task_id) AND (t.assigned_to = ( SELECT auth.uid() AS uid))))))));

create policy "Managers delete evidence" on public."task_evidence" as PERMISSIVE for DELETE to "authenticated" using (growthos_is_manager());

create policy "Admins read workload targets" on public."workload_targets" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() = 'ADMIN'::text));

create policy "Admins manage workload targets" on public."workload_targets" as PERMISSIVE for ALL to "authenticated" using ((growthos_current_role() = 'ADMIN'::text)) with check ((growthos_current_role() = 'ADMIN'::text));

create policy "Users read own snapshots" on public."workload_snapshots" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR (growthos_current_role() = 'ADMIN'::text)));

create policy "Authenticated users read email templates" on public."email_templates" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() IS NOT NULL));

create policy "Users manage own email templates" on public."email_templates" as PERMISSIVE for ALL to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Users read own drafts" on public."email_drafts" as PERMISSIVE for SELECT to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Users manage own drafts" on public."email_drafts" as PERMISSIVE for ALL to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Authenticated users read SEO audits" on public."seo_audits" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() IS NOT NULL));

create policy "Users create SEO audits" on public."seo_audits" as PERMISSIVE for INSERT to "authenticated" with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Authenticated users read lead magnets" on public."lead_magnets" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() IS NOT NULL));

create policy "Users manage own lead magnets" on public."lead_magnets" as PERMISSIVE for ALL to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager())) with check (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Users read own reports" on public."reports" as PERMISSIVE for SELECT to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) OR growthos_is_manager()));

create policy "Users create own reports" on public."reports" as PERMISSIVE for INSERT to "authenticated" with check ((created_by = ( SELECT auth.uid() AS uid)));

create policy "Authenticated users read niche intelligence" on public."campaign_niche_intelligence" as PERMISSIVE for SELECT to "authenticated" using ((growthos_current_role() IS NOT NULL));

create policy "Managers manage niche intelligence" on public."campaign_niche_intelligence" as PERMISSIVE for ALL to "authenticated" using (growthos_is_manager()) with check (growthos_is_manager());

alter table public."profiles" enable row level security;

alter table public."campaigns" enable row level security;

alter table public."prospects" enable row level security;

alter table public."tasks" enable row level security;

alter table public."task_evidence" enable row level security;

alter table public."workload_targets" enable row level security;

alter table public."workload_snapshots" enable row level security;

alter table public."email_templates" enable row level security;

alter table public."email_drafts" enable row level security;

alter table public."seo_audits" enable row level security;

alter table public."lead_magnets" enable row level security;

alter table public."reports" enable row level security;

alter table public."campaign_niche_intelligence" enable row level security;

grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
