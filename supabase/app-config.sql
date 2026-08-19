-- ============================================================================
-- app_config — a single-row remote config the app reads on launch. Drives the
-- FORCE-UPDATE gate: if a phone's installed app version is below
-- min_ios_version / min_android_version, the app shows a blocking "Update
-- required" screen (components/force-update-gate.tsx).
--
-- Change these values anytime IN THE DASHBOARD (no app update needed) to force
-- everyone below a version onto the store. The gate FAILS OPEN — a bad/missing
-- value never locks users out, it just won't block.
--
-- IMPORTANT: a force-gate only affects phones whose app already CONTAINS the
-- gate code. So setting min_ios_version = '1.1' today blocks nobody (1.1 users
-- are already >= 1.1; the older 1.0.0 users don't have the gate yet). It arms
-- the mechanism for the NEXT release: when 1.2 ships, set min_ios_version =
-- '1.2' and every 1.1 user is force-updated.
--
-- Run this whole block once in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.app_config (
  id                  int primary key default 1,
  min_ios_version     text not null default '1.1',
  min_android_version text not null default '1.0',
  updated_at          timestamptz not null default now(),
  constraint app_config_single_row check (id = 1)
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- World-readable: the gate must read this on launch, possibly before sign-in.
-- No app-side writes — you edit the values in the dashboard yourself.
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select using (true);
