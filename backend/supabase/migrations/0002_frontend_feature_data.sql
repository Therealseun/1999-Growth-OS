-- Supporting content for frontend features that do not have a canonical domain table in 0001.
-- Task execution, campaign, prospect, target, workload and audit records stay in their 0001 tables.

create table email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null,
  body        text not null,
  category    text not null default 'GENERAL',
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table email_drafts (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null,
  body         text not null,
  campaign_id  uuid references campaigns(id) on delete set null,
  prospect_ids uuid[] not null default '{}',
  status       text not null default 'DRAFT' check (status in ('DRAFT', 'SENT')),
  sent_at      timestamptz,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table seo_audits (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  overall_score    numeric(5,2) check (overall_score between 0 and 100),
  categories       jsonb not null default '{}',
  recommendations  jsonb not null default '[]',
  errors           jsonb not null default '[]',
  created_by       uuid not null references profiles(id),
  created_at       timestamptz not null default now()
);

create table lead_magnet_content (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references campaigns(id) on delete set null,
  name         text not null,
  content_type text not null,
  description  text not null default '',
  content      text,
  status       text not null default 'DRAFT' check (status in ('DRAFT', 'READY', 'ARCHIVED')),
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table report_definitions (
  id           uuid primary key default gen_random_uuid(),
  report_type  text not null check (report_type in ('PIPELINE', 'PERFORMANCE', 'TASK_AUDIT')),
  campaign_id  uuid references campaigns(id) on delete set null,
  date_from    date,
  date_to      date,
  format       text not null default 'CSV' check (format in ('CSV', 'JSON')),
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  check (date_from is null or date_to is null or date_from <= date_to)
);

create trigger email_templates_touch before update on email_templates for each row execute function touch_updated_at();
create trigger email_drafts_touch before update on email_drafts for each row execute function touch_updated_at();
create trigger lead_magnet_content_touch before update on lead_magnet_content for each row execute function touch_updated_at();

create trigger audit_email_templates after insert or update or delete on email_templates for each row execute function audit_row();
create trigger audit_email_drafts after insert or update or delete on email_drafts for each row execute function audit_row();
create trigger audit_seo_audits after insert or update or delete on seo_audits for each row execute function audit_row();
create trigger audit_lead_magnet_content after insert or update or delete on lead_magnet_content for each row execute function audit_row();
create trigger audit_report_definitions after insert or update or delete on report_definitions for each row execute function audit_row();
