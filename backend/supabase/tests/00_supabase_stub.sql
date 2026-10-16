-- Local stand-in for the parts of Supabase the schema depends on. Do NOT run this on Supabase.
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  create role anon nologin; create role authenticated nologin;
exception when duplicate_object then null; end $$;
grant usage on schema auth to authenticated, anon;
