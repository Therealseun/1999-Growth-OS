-- Acceptance test for the GrowthOS V1 spec (section 27) plus carry-over, backfill, locks and access rules.
-- Run after 0001_init.sql on a scratch database. Every check raises an exception on failure.
\set ON_ERROR_STOP on
begin;

-- people
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t.test',  '{"name":"Admin"}'),
  ('e0000000-0000-0000-0000-000000000001', 'sarah@t.test',  '{"name":"Sarah","role":"ADMIN","status":"ACTIVE"}'),
  ('e0000000-0000-0000-0000-000000000002', 'tunde@t.test',  '{"name":"Tunde"}');

do $$ begin
  assert (select role::text || status::text from profiles where email = 'sarah@t.test') = 'EMPLOYEEPENDING',
    'sign-up must ignore role/status in metadata';
end $$;

insert into departments (id, name) values ('d0000000-0000-0000-0000-000000000001', 'Schools desk');
update profiles set role = 'ADMIN', status = 'ACTIVE' where email = 'admin@t.test';
update profiles set status = 'ACTIVE', department_id = 'd0000000-0000-0000-0000-000000000001' where email in ('sarah@t.test', 'tunde@t.test');

insert into campaigns (id, name, niche, offer, location, objective, status, department_id, created_by)
values ('c0000000-0000-0000-0000-000000000001', 'Bearilly School Outreach', 'Nigerian Private Schools', 'Bearilly AI Tutor',
        'Nigeria', 'Qualified school conversations', 'ACTIVE', 'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001');

select sync_campaign_assignments('c0000000-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from campaign_assignments where active) = 2, 'both employees auto assigned'; end $$;

-- one active campaign per department
do $$ begin
  begin
    insert into campaigns (name, niche, offer, location, objective, status, department_id, created_by)
    values ('Second', 'x', 'x', 'x', 'x', 'ACTIVE', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'second active campaign was allowed';
  exception when unique_violation then null; end;
end $$;

-- global default targets 600/16/30 from Oct 5; use one employee for the numbers
update campaign_assignments set active = false where employee_id = 'e0000000-0000-0000-0000-000000000002';
insert into campaign_targets (campaign_id, email_daily_target, seo_daily_target, lead_magnet_daily_target, effective_from, updated_by)
values (null, 600, 16, 30, '2026-10-05', 'a0000000-0000-0000-0000-000000000001');

-- pool delivered by the "AI teammate": 1000 emails, 40 SEO, 60 lead magnets, all unassigned
insert into prospects (campaign_id, sift_id, organisation, email, qualification_status)
select 'c0000000-0000-0000-0000-000000000001', 's' || i, 'School ' || i, 'p' || i || '@school.test', 'QUALIFIED'
from generate_series(1, 2000) i;
insert into email_tasks (campaign_id, prospect_id, subject, body, external_ref)
select p.campaign_id, p.id, 'Hello ' || p.organisation, repeat('x', 2000), 'e-' || p.sift_id
from prospects p where p.sift_id::text in (select 's' || i from generate_series(1, 1000) i);
insert into seo_tasks (campaign_id, topic, primary_keyword, title, article, external_ref)
select 'c0000000-0000-0000-0000-000000000001', 't' || i, 'k' || i, 'Title ' || i, 'article', 'seo-' || i from generate_series(1, 40) i;
insert into lead_magnet_tasks (campaign_id, platform, post_url, comment, external_ref)
select 'c0000000-0000-0000-0000-000000000001', 'LinkedIn', 'https://x.test/' || i, 'comment', 'lm-' || i from generate_series(1, 60) i;

-- idempotent delivery: same external_ref twice must not create a second row
do $$ begin
  begin
    insert into seo_tasks (campaign_id, topic, primary_keyword, title, external_ref)
    values ('c0000000-0000-0000-0000-000000000001', 'dup', 'dup', 'dup', 'seo-1');
    raise exception 'duplicate external_ref accepted';
  exception when unique_violation then null; end;
end $$;

-- DAY 1: Oct 5
select create_daily_workloads('2026-10-05');
select count(*) as shortfall_rows from assign_pool_tasks('2026-10-05') where shortfall > 0;

do $$
declare w daily_workloads;
begin
  select * into w from daily_workloads where work_date = '2026-10-05';
  assert w.total_target_snapshot = 646, 'day 1 total must be 646, got ' || w.total_target_snapshot;
  assert (select count(*) from email_tasks where employee_id = w.employee_id) = 600, 'email assigned 600';
  assert (select count(*) from seo_tasks where employee_id = w.employee_id) = 16, 'seo assigned 16';
  assert (select count(*) from lead_magnet_tasks where employee_id = w.employee_id) = 30, 'lead assigned 30';
end $$;

-- rerunning generation the same day must not change anything
select create_daily_workloads('2026-10-05');
do $$ begin
  assert (select count(*) from daily_workloads where work_date = '2026-10-05') = 1, 'workload creation is idempotent';
  assert (select count(*) from assign_pool_tasks('2026-10-05') where assigned > 0) = 0, 'assignment is idempotent';
end $$;

-- employee works: 572 emails, 16 SEO, 27 lead magnets on Oct 5 (Lagos time)
update email_tasks set status = 'SENT', sent_at = '2026-10-05 10:00+01'
where id in (select id from email_tasks where employee_id = 'e0000000-0000-0000-0000-000000000001' order by created_at limit 572);
update seo_tasks set status = 'PUBLISHED', published_at = '2026-10-05 15:00+01', published_url = 'https://x.test/a'
where employee_id = 'e0000000-0000-0000-0000-000000000001';
update lead_magnet_tasks set status = 'POSTED', posted_at = '2026-10-05 16:00+01'
where id in (select id from lead_magnet_tasks where employee_id = 'e0000000-0000-0000-0000-000000000001' order by created_at limit 27);

do $$
declare r v_daily_report;
begin
  select * into r from v_daily_report where work_date = '2026-10-05';
  assert r.email_completed = 572 and r.seo_completed = 16 and r.lead_magnet_completed = 27, 'completed counts';
  assert r.total_completed = 615 and r.total_target_snapshot = 646, 'totals 615 / 646';
  assert r.completion_pct = 95.2, 'completion 95.2, got ' || r.completion_pct;
end $$;

-- DAY 2: Admin changes targets to 800/20/40 effective Oct 6
insert into campaign_targets (campaign_id, email_daily_target, seo_daily_target, lead_magnet_daily_target, effective_from, updated_by)
values (null, 800, 20, 40, '2026-10-06', 'a0000000-0000-0000-0000-000000000001');

select create_daily_workloads('2026-10-06');
do $$
declare w daily_workloads;
begin
  select * into w from daily_workloads where work_date = '2026-10-06';
  assert w.total_target_snapshot = 860, 'day 2 total must be 860, got ' || w.total_target_snapshot;
  assert w.carried_in_email = 28 and w.carried_in_seo = 0 and w.carried_in_lead_magnet = 3, 'carry-over counts 28/0/3';
end $$;

-- pool only holds 400 emails, so day 2 starts short and reports the shortfall
do $$
declare s record;
begin
  select * into s from assign_pool_tasks('2026-10-06') where ws = 'EMAIL';
  assert s.target = 800 and s.assigned = 400 and s.shortfall = 372, 'email shortfall 372, got ' || s.shortfall;
  assert s.prepared = 800 - 372, 'prepared 428 (28 carried + 400 new)';
end $$;

-- backfill: teammate delivers 400 more, engine tops up and shortfall closes
insert into email_tasks (campaign_id, prospect_id, subject, body, external_ref)
select p.campaign_id, p.id, 'Hello', 'b', 'e2-' || p.sift_id
from prospects p where p.sift_id in (select 's' || i from generate_series(1001, 1400) i);
do $$
declare s record;
begin
  select * into s from assign_pool_tasks('2026-10-06') where ws = 'EMAIL';
  assert s.shortfall = 0 and s.prepared = 800, 'backfill closes the gap';
end $$;

-- history untouched
do $$
declare r v_daily_report;
begin
  select * into r from v_daily_report where work_date = '2026-10-05';
  assert r.total_target_snapshot = 646 and r.completion_pct = 95.2, 'Oct 5 report unchanged after target change';
end $$;

-- immutability and locks
do $$ begin
  begin update daily_workloads set email_target_snapshot = 1; raise exception 'workload update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from campaign_targets; raise exception 'target delete allowed';
  exception when insufficient_privilege then null; end;
  begin update email_tasks set subject = 'tampered' where status = 'SENT'; raise exception 'completed task edit allowed';
  exception when insufficient_privilege then null; end;
  begin delete from audit_log; raise exception 'audit delete allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- evidence: one task only, immutable
insert into execution_evidence (workstream, email_task_id, employee_id, evidence_type, evidence_value)
select 'EMAIL', id, 'e0000000-0000-0000-0000-000000000001', 'TEXT', 'sent to p1@school.test'
from email_tasks where status = 'SENT' limit 1;
do $$ begin
  begin
    insert into execution_evidence (workstream, email_task_id, seo_task_id, employee_id, evidence_type, evidence_value)
    select 'EMAIL', e.id, s.id, 'e0000000-0000-0000-0000-000000000001', 'TEXT', 'x'
    from email_tasks e, seo_tasks s limit 1;
    raise exception 'two-task evidence accepted';
  exception when check_violation then null; end;
  begin update execution_evidence set evidence_value = 'edited'; raise exception 'evidence edit allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- expiry: a lead magnet created 3 days ago expires, an email does not
insert into lead_magnet_tasks (campaign_id, platform, post_url, comment, external_ref, created_at)
values ('c0000000-0000-0000-0000-000000000001', 'X', 'https://x.test/old', 'c', 'lm-old', now() - interval '3 days');
do $$ begin
  assert expire_stale_tasks() >= 1, 'stale lead magnet expired';
  assert (select status from lead_magnet_tasks where external_ref = 'lm-old') = 'EXPIRED', 'status EXPIRED';
end $$;

-- retention purge removes bodies of old sent emails only
select set_config('app.amend', 'on', true);
update email_tasks set sent_at = now() - interval '40 days' where id = (select id from email_tasks where status = 'SENT' limit 1);
select set_config('app.amend', 'off', true);
do $$ begin
  assert purge_old_content() = 1, 'exactly one old body purged';
  assert (select count(*) from email_tasks where status = 'SENT' and body is null) = 1, 'body removed';
  assert (select count(*) from email_tasks where status = 'SENT' and body is not null) = 571, 'recent bodies kept';
end $$;

-- audit trail recorded the target change and task status changes
do $$ begin
  assert (select count(*) from audit_log where entity_type = 'campaign_targets' and action = 'INSERT') = 2, 'target changes audited';
  assert (select count(*) from audit_log where entity_type = 'email_tasks') > 0, 'task status changes audited';
end $$;

-- access rules through RLS
grant select on all tables in schema public to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
do $$ begin
  assert (select count(*) from email_tasks where employee_id <> auth.uid()) = 0, 'employee sees only own email tasks';
  assert (select count(*) from audit_log) = 0, 'employee cannot read audit log';
  assert (select count(*) from campaign_targets) = 0, 'employee cannot read targets table';
  begin update email_tasks set subject = 'x' where status = 'READY'; raise exception 'employee write allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
do $$ begin
  assert (select count(*) from audit_log) > 0, 'admin reads audit log';
  assert (select count(*) from campaign_targets) = 2, 'admin reads targets';
end $$;
reset role;
rollback;
select 'ALL CHECKS PASSED' as result;
