-- ═══════════════════════════════════════════════════════════════════════════
-- notification_preferences — per-user push categories, honoured at SEND time.
--
-- WHY a table and not AsyncStorage (which is where these used to live): a notification is
-- created by the OTHER person's device. When a manager assigns a gig, the manager's phone
-- calls create-notification. The artist's preferences sat in the artist's local storage,
-- which that device cannot read — so the toggles were inert. Nothing outside the settings
-- screens ever read those keys. Preferences have to live where the sender can see them.
--
-- A missing row means everything is on, so no backfill is needed; the row is created the
-- first time a user changes a switch.
--
-- Switching a category off suppresses the PUSH only — the in-app row is still written, so
-- the notification list stays a complete record and a gig request is never silently lost.
--
-- Categories are grouped by what a user recognises, not by internal type slug. The
-- type → category mapping lives in TWO places that must stay in step:
--   · lib/notification-roles.ts   (the app)
--   · supabase/functions/create-notification/index.ts   (the sender)
-- The edge function is Deno and cannot import from lib/, hence the duplication.
--
-- STATUS: deployed 19 Jul 2026.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  -- artist-facing
  gig_requests     boolean not null default true,
  gig_updates      boolean not null default true,
  lineup_venues    boolean not null default true,
  reminders        boolean not null default true,
  -- manager-facing
  artist_responses boolean not null default true,
  roster           boolean not null default true,
  reviews          boolean not null default true,
  invoices         boolean not null default true,
  updated_at       timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "own prefs read"   on public.notification_preferences;
drop policy if exists "own prefs write"  on public.notification_preferences;
drop policy if exists "own prefs update" on public.notification_preferences;

create policy "own prefs read" on public.notification_preferences
  for select using (auth.uid() = user_id);

create policy "own prefs write" on public.notification_preferences
  for insert with check (auth.uid() = user_id);

create policy "own prefs update" on public.notification_preferences
  for update using (auth.uid() = user_id);
