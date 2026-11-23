-- Palladium: user accounts and learning progress.
-- Run this in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 80
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_id text not null check (char_length(quiz_id) between 1 and 100),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  completed_at timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);

create table if not exists public.activity_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  activity_id text not null check (char_length(activity_id) between 1 and 100),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);

-- Server-side administrator allowlist. Change this address if the administrator
-- signs in with a different email account.
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(btrim(email)))
);

insert into public.admin_allowlist (email)
values ('muralipalla@gmail.com')
on conflict (email) do nothing;

create index if not exists quiz_attempts_user_quiz_date_idx
  on public.quiz_attempts (user_id, quiz_id, completed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists activity_state_set_updated_at on public.activity_state;
create trigger activity_state_set_updated_at
before update on public.activity_state
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(
      left(
        btrim(
          coalesce(
            new.raw_user_meta_data ->> 'display_name',
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            ''
          )
        ),
        80
      ),
      ''
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.activity_state enable row level security;
alter table public.admin_allowlist enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_allowlist
    where email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    users.id,
    users.email::text,
    profiles.display_name,
    users.created_at,
    users.last_sign_in_at
  from auth.users as users
  left join public.profiles as profiles on profiles.user_id = users.id
  order by users.last_sign_in_at desc nulls last, users.created_at desc;
end;
$$;

create or replace function public.admin_list_quiz_attempts(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  attempt_id uuid,
  display_name text,
  email text,
  quiz_id text,
  score integer,
  total integer,
  completed_at timestamptz,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    attempts.id,
    profiles.display_name,
    users.email::text,
    attempts.quiz_id,
    attempts.score,
    attempts.total,
    attempts.completed_at,
    attempts.details
  from public.quiz_attempts as attempts
  join auth.users as users on users.id = attempts.user_id
  left join public.profiles as profiles on profiles.user_id = attempts.user_id
  order by attempts.completed_at desc, attempts.id desc
  limit least(greatest(coalesce(p_limit, 101), 1), 101)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_select_own on public.quiz_attempts;
create policy quiz_attempts_select_own
on public.quiz_attempts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_insert_own on public.quiz_attempts;
create policy quiz_attempts_insert_own
on public.quiz_attempts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_delete_own on public.quiz_attempts;
create policy quiz_attempts_delete_own
on public.quiz_attempts for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists activity_state_select_own on public.activity_state;
create policy activity_state_select_own
on public.activity_state for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists activity_state_insert_own on public.activity_state;
create policy activity_state_insert_own
on public.activity_state for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists activity_state_update_own on public.activity_state;
create policy activity_state_update_own
on public.activity_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists activity_state_delete_own on public.activity_state;
create policy activity_state_delete_own
on public.activity_state for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table
  public.profiles,
  public.quiz_attempts,
  public.activity_state,
  public.admin_allowlist
from anon;

revoke all on table public.admin_allowlist from authenticated;
revoke all on function public.is_site_admin() from public;
revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_quiz_attempts(integer, integer) from public, anon;

grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, delete on table public.quiz_attempts to authenticated;
grant select, insert, update, delete on table public.activity_state to authenticated;
grant execute on function public.is_site_admin() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_quiz_attempts(integer, integer) to authenticated;

-- Optional quiz timing and selected-score cleanup (upgrade existing projects
-- by applying this section). No existing attempts are deleted by this setup.
create schema if not exists palladium_private;
revoke all on schema palladium_private from public, anon;
grant usage on schema palladium_private to authenticated;

-- Small ID-only markers prevent offline/imported copies from recreating a
-- deleted score. Scores and their detailed JSON are removed, not archived.
create table if not exists public.quiz_attempt_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id uuid not null,
  primary key (user_id, client_attempt_id)
);
alter table public.quiz_attempt_deletions enable row level security;
revoke all on table public.quiz_attempt_deletions from anon, authenticated;
grant select, insert on table public.quiz_attempt_deletions to authenticated;
drop policy if exists quiz_attempt_deletions_select_own on public.quiz_attempt_deletions;
create policy quiz_attempt_deletions_select_own on public.quiz_attempt_deletions
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists quiz_attempt_deletions_insert_own on public.quiz_attempt_deletions;
create policy quiz_attempt_deletions_insert_own on public.quiz_attempt_deletions
for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function palladium_private.remember_deleted_quiz_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- This trigger runs only after a permitted row deletion. Auth/system account
  -- removal may have no user JWT and must not recreate an orphaned marker.
  if (select auth.uid()) is null and current_setting('role', true) not in ('none', 'postgres', 'service_role', 'supabase_auth_admin') then
    raise exception 'Authenticated score deletion required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = old.user_id) then return old; end if;
  insert into public.quiz_attempt_deletions (user_id, client_attempt_id)
  values (old.user_id, old.client_attempt_id) on conflict do nothing;
  update public.activity_state as activity
  set state = jsonb_set(activity.state, '{logs}', (
    select coalesce(jsonb_agg(log_entry), '[]'::jsonb)
    from jsonb_array_elements(activity.state -> 'logs') as log_entry
    where log_entry ->> 'clientAttemptId' is distinct from old.client_attempt_id::text
  ))
  where activity.user_id = old.user_id
    and activity.activity_id = old.quiz_id
    and jsonb_typeof(activity.state -> 'logs') = 'array'
    and activity.state -> 'logs' @> jsonb_build_array(jsonb_build_object('clientAttemptId', old.client_attempt_id::text));
  return old;
end;
$$;

create or replace function public.reject_deleted_quiz_attempt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.quiz_attempt_deletions
    where user_id = new.user_id and client_attempt_id = new.client_attempt_id) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function public.filter_deleted_quiz_logs()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(new.state -> 'logs') = 'array' then
    new.state = jsonb_set(new.state, '{logs}', (
      select coalesce(jsonb_agg(log_entry), '[]'::jsonb)
      from jsonb_array_elements(new.state -> 'logs') as log_entry
      where not exists (
        select 1 from public.quiz_attempt_deletions as deleted
        where deleted.user_id = new.user_id
          and deleted.client_attempt_id::text = log_entry ->> 'clientAttemptId'
      )
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_attempt_remember_deletion on public.quiz_attempts;
create trigger quiz_attempt_remember_deletion after delete on public.quiz_attempts
for each row execute function palladium_private.remember_deleted_quiz_attempt();
drop trigger if exists quiz_attempt_reject_deleted on public.quiz_attempts;
create trigger quiz_attempt_reject_deleted before insert on public.quiz_attempts
for each row execute function public.reject_deleted_quiz_attempt();
drop trigger if exists activity_state_filter_deleted_logs on public.activity_state;
create trigger activity_state_filter_deleted_logs before insert or update of state on public.activity_state
for each row execute function public.filter_deleted_quiz_logs();

-- The privileged functions live outside the exposed API schema. Each checks
-- the signed-in caller against the existing server-owned administrator list.
create or replace function palladium_private.admin_list_quiz_attempts_v2(
  p_limit integer default 100, p_offset integer default 0,
  p_before timestamptz default null, p_student text default null,
  p_quiz_id text default null
)
returns table (
  attempt_id uuid, user_id uuid, display_name text, email text, quiz_id text,
  score integer, total integer, duration_seconds integer,
  completed_at timestamptz, details jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  select attempts.id, attempts.user_id, profiles.display_name, users.email::text,
    attempts.quiz_id, attempts.score, attempts.total, attempts.duration_seconds,
    attempts.completed_at, attempts.details
  from public.quiz_attempts as attempts
  join auth.users as users on users.id = attempts.user_id
  left join public.profiles as profiles on profiles.user_id = attempts.user_id
  where (p_before is null or attempts.completed_at < p_before)
    and (nullif(btrim(p_quiz_id), '') is null or attempts.quiz_id = p_quiz_id)
    and (nullif(btrim(p_student), '') is null or position(lower(left(btrim(p_student), 200)) in lower(coalesce(profiles.display_name, '') || ' ' || users.email::text)) > 0)
  order by attempts.completed_at desc, attempts.id desc
  limit least(greatest(coalesce(p_limit, 101), 1), 101)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function palladium_private.admin_delete_quiz_attempts(p_attempt_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare deleted_count integer;
begin
  if (select auth.uid()) is null or not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_attempt_ids is null or cardinality(p_attempt_ids) not between 1 and 100
    or array_position(p_attempt_ids, null) is not null then
    raise exception 'Select between 1 and 100 quiz records' using errcode = '22023';
  end if;
  delete from public.quiz_attempts where id = any(p_attempt_ids);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.admin_list_quiz_attempts_v2(
  p_limit integer default 100, p_offset integer default 0,
  p_before timestamptz default null, p_student text default null,
  p_quiz_id text default null
)
returns table (
  attempt_id uuid, user_id uuid, display_name text, email text, quiz_id text,
  score integer, total integer, duration_seconds integer,
  completed_at timestamptz, details jsonb
)
language sql stable security invoker set search_path = '' as $$
  select * from palladium_private.admin_list_quiz_attempts_v2(p_limit, p_offset, p_before, p_student, p_quiz_id);
$$;

create or replace function public.admin_delete_quiz_attempts(p_attempt_ids uuid[])
returns integer language sql security invoker set search_path = '' as $$
  select palladium_private.admin_delete_quiz_attempts(p_attempt_ids);
$$;

revoke all on function palladium_private.remember_deleted_quiz_attempt() from public, anon, authenticated;
revoke all on function public.reject_deleted_quiz_attempt() from public, anon, authenticated;
revoke all on function public.filter_deleted_quiz_logs() from public, anon, authenticated;
revoke all on function palladium_private.admin_list_quiz_attempts_v2(integer, integer, timestamptz, text, text) from public, anon, authenticated;
revoke all on function palladium_private.admin_delete_quiz_attempts(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_list_quiz_attempts_v2(integer, integer, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_delete_quiz_attempts(uuid[]) from public, anon, authenticated;
grant execute on function palladium_private.admin_list_quiz_attempts_v2(integer, integer, timestamptz, text, text) to authenticated;
grant execute on function palladium_private.admin_delete_quiz_attempts(uuid[]) to authenticated;
grant execute on function public.admin_list_quiz_attempts_v2(integer, integer, timestamptz, text, text) to authenticated;
grant execute on function public.admin_delete_quiz_attempts(uuid[]) to authenticated;

-- Remove legacy explicit anonymous grants as well as the PUBLIC grant.
revoke all on function public.is_site_admin() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
