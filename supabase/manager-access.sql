-- ============================================================================
-- MANAGER ACCESS — invite-only manager signup.
--
-- A new manager can only create an account if their email is on the
-- `manager_allowlist`. New requests are recorded in `manager_requests` and
-- emailed to admin@nexgigapp.com (by the send-email edge function). To approve
-- someone: add their email (lowercase) to `manager_allowlist`.
--
-- Existing managers are seeded into the allow-list below, so they're unaffected.
-- Removing a manager = delete their auth user + managers row (as before); the
-- allow-list is only checked when a NEW managers row is created.
--
-- Run this whole file once in the Supabase SQL editor.
-- ============================================================================

-- 1. Allow-list: the emails approved to become managers.
create table if not exists public.manager_allowlist (
  email      text primary key,          -- store LOWERCASE
  added_at   timestamptz not null default now()
);
alter table public.manager_allowlist enable row level security;
-- No policies on purpose → no client can read/write the list. It's reached only
-- by the security-definer function + trigger below.

-- 2. Requests: a record of everyone who asked for manager access (written by the
--    send-email edge function with the service role; not client-readable).
create table if not exists public.manager_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  full_name  text,
  phone      text,
  venues     text,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.manager_requests enable row level security;
-- No policies → only the service role (edge function) reads/writes it.

-- 3. The check the app runs before manager signup. SECURITY DEFINER so it can
--    read the allow-list even though the table is locked down; callable by anyone
--    (a person requesting access has no session yet).
create or replace function public.is_manager_allowed(check_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.manager_allowlist
    where lower(email) = lower(trim(check_email))
  );
$$;
grant execute on function public.is_manager_allowed(text) to anon, authenticated;

-- 4. The HARD lock: block creating a managers row unless the email is approved.
--    This is the real enforcement — even a direct DB call can't make an
--    unapproved manager. Fires only on INSERT, so existing managers (and any
--    upsert that UPDATES an existing row) are never blocked.
create or replace function public.enforce_manager_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.email is null
     or not exists (
       select 1 from public.manager_allowlist
       where lower(email) = lower(trim(NEW.email))
     ) then
    raise exception 'Manager access not approved for %', NEW.email
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_manager_allowlist on public.managers;
create trigger trg_enforce_manager_allowlist
  before insert on public.managers
  for each row execute function public.enforce_manager_allowlist();

-- 5. Seed the allow-list with every EXISTING manager so none of them is ever
--    blocked. Safe + re-runnable.
insert into public.manager_allowlist (email)
select distinct lower(trim(email)) from public.managers where email is not null
on conflict (email) do nothing;
