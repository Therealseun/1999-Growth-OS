-- ADDITIVE extension for the EXISTING team schema. Review before applying.
-- Do NOT run the foundation migrations in backend/legacy-foundation/migrations.
-- No existing public table, function, trigger, policy, target or user is changed.
begin;
set local lock_timeout = '5s';
create schema growthos_ai;
revoke all on schema growthos_ai from public, anon, authenticated;
create table growthos_ai.version (version integer primary key);
insert into growthos_ai.version values (1);
create table growthos_ai.settings (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 offer text not null, location text not null,
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now()
);
create table growthos_ai.profiles (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 version integer not null, profile jsonb not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','SUPERSEDED')),
 campaign_snapshot jsonb not null, created_at timestamptz not null default now(),
 approved_by uuid references public.profiles(id), approved_at timestamptz,
 unique(campaign_id,version)
);
create unique index one_approved_profile on growthos_ai.profiles(campaign_id) where status='APPROVED';
create table growthos_ai.jobs (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 requested_by uuid not null references public.profiles(id),
 employee_id uuid references public.profiles(id),
 kind text not null check(kind in ('NICHE_ANALYSIS','PROSPECT_SEARCH','EMAIL_GENERATION','SEO_GENERATION','LEAD_MAGNET_GENERATION')),
 status text not null default 'REQUESTED' check(status in ('REQUESTED','RUNNING','COMPLETED','FAILED','CANCELLED')),
 requested_count integer not null check(requested_count>0), delivered_count integer not null default 0 check(delivered_count>=0 and delivered_count<=requested_count),
 request_payload jsonb not null, idempotency_key text not null, research_provider text not null check(research_provider in ('sift','apify')),
 external_job_id text, state jsonb not null default '{}', attempts integer not null default 0,
 error_code text,error text, lease_token uuid,lease_expires_at timestamptz,
 next_run_at timestamptz not null default now(),requested_at timestamptz not null default now(),accepted_at timestamptz,completed_at timestamptz,updated_at timestamptz not null default now(),
 unique(campaign_id,idempotency_key)
);
create index jobs_due on growthos_ai.jobs(next_run_at) where status in ('REQUESTED','RUNNING');
create table growthos_ai.candidates (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns(id) on delete cascade,
 job_id uuid not null references growthos_ai.jobs(id),record jsonb not null,
 research_provider text not null,provider_record_id text not null,
 qualification jsonb not null,disposition text not null default 'NEW' check(disposition in ('NEW','IMPORTED','EXISTING')),
 prospect_id uuid references public.prospects(id) on delete set null,
 imported_by uuid references public.profiles(id),created_at timestamptz not null default now(),
 unique(campaign_id,research_provider,provider_record_id)
);
create unique index candidates_email on growthos_ai.candidates(campaign_id,lower(record->>'email')) where record->>'email' is not null;
create table growthos_ai.outputs (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references growthos_ai.jobs(id),
 item_key text not null,campaign_id uuid not null references public.campaigns(id) on delete cascade,
 kind text not null,task_id uuid references public.tasks(id) on delete set null,
 email_draft_id uuid references public.email_drafts(id) on delete set null,
 prospect_id uuid references public.prospects(id) on delete set null,
 post_url text,title text not null,payload jsonb not null,created_at timestamptz not null default now(),
 unique(job_id,item_key)
);
create unique index email_prospect_output on growthos_ai.outputs(prospect_id) where kind='EMAIL_GENERATION' and prospect_id is not null;
create unique index comment_source_output on growthos_ai.outputs(campaign_id,post_url) where post_url is not null;
create table growthos_ai.usage (
 id bigint generated always as identity primary key,job_id uuid not null references growthos_ai.jobs(id),module text not null,model text not null,
 prompt_tokens integer,completion_tokens integer,created_at timestamptz not null default now()
);
-- Backend connection owner only. This schema must NOT be added to Supabase exposed schemas.
revoke all on all tables in schema growthos_ai from public,anon,authenticated;
revoke all on all sequences in schema growthos_ai from public,anon,authenticated;
commit;
