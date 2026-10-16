-- Apply AFTER 0001_init.sql. This belongs to the standalone backend schema.
begin;
alter table prospects alter column sift_id drop not null;
alter table prospects add column research_provider text not null default 'sift'
  check (research_provider in ('sift', 'apify'));
alter table prospects add column provider_record_id text;
update prospects set provider_record_id = sift_id;
alter table prospects alter column provider_record_id set not null;
create unique index prospects_provider_record_uq on prospects(campaign_id, research_provider, provider_record_id);
-- Keep the existing Sift-only INSERT contract working during the transition.
create function fill_prospect_provider_identity() returns trigger language plpgsql as $$
begin
  if new.research_provider = 'sift' then
    new.provider_record_id := coalesce(new.provider_record_id, new.sift_id);
    new.sift_id := coalesce(new.sift_id, new.provider_record_id);
    if new.sift_id is distinct from new.provider_record_id then
      raise exception 'Sift identifiers must match' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger prospects_provider_identity before insert or update on prospects
  for each row execute function fill_prospect_provider_identity();

alter table integration_jobs
  add column idempotency_key text,
  add column requested_by uuid references profiles(id),
  add column workload_id uuid references daily_workloads(id),
  add column research_provider text check (research_provider in ('sift', 'apify')),
  add column state jsonb not null default '{}',
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_run_at timestamptz not null default now(),
  add column error_code text,
  add column updated_at timestamptz not null default now();
create unique index integration_job_request_uq on integration_jobs(campaign_id,idempotency_key);
create unique index integration_job_workload_kind_uq on integration_jobs(workload_id,kind) where workload_id is not null;
create index integration_jobs_due_idx on integration_jobs(next_run_at)
  where status in ('REQUESTED','RUNNING');

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references integration_jobs(id) on delete cascade,
  module text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);
alter table ai_usage enable row level security;
-- Service connection only. Never expose prompts, provider keys or raw responses to browser clients.
commit;
