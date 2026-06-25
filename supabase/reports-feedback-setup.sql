-- ════════════════════════════════════════════════════════════════════════════
-- Reports + Feedback: tables, RLS, and authenticated-insert policies
-- Run this in the Supabase SQL editor (dashboard). One-time setup.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── REPORTS ────────────────────────────────────────────────────────────────
-- (Table already exists & is empty; this ensures the shape + an INSERT policy.)
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  reported_type text not null check (reported_type in ('artist','venue')),
  reported_id   uuid not null,
  reason        text,
  details       text,
  created_at    timestamptz not null default now()
);

alter table public.reports enable row level security;

-- A logged-in user may insert a report as themselves.
drop policy if exists "reporters can insert own reports" on public.reports;
create policy "reporters can insert own reports"
  on public.reports for insert to authenticated
  with check (auth.uid() = reporter_id);

-- (No SELECT policy for normal users — reports are admin-only. Read them in the
--  dashboard / with the service role. RLS-on + no select policy = nobody reads
--  via the client, which is what we want.)


-- ─── FEEDBACK ───────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  account_type  text check (account_type in ('artist','manager')),
  category      text,
  subject       text,
  message       text not null,
  created_at    timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- A logged-in user may insert feedback as themselves (user_id may be null in the
-- rare no-session case, but the client always sends it when signed in).
drop policy if exists "users can insert own feedback" on public.feedback;
create policy "users can insert own feedback"
  on public.feedback for insert to authenticated
  with check (user_id is null or auth.uid() = user_id);

-- (No SELECT policy — feedback is admin-only, same as reports.)
