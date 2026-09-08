-- "Skip this date" for recurring venue schedules.
--
-- When a manager deletes a schedule-generated slot for one specific night (e.g. one Friday of a
-- weekly programme), we record that (venue, date, start, end) here. lib/venue-schedule-sync.ts →
-- ensureScheduleSlots() folds these into its "already have" set, so the deleted night is NOT
-- re-created on the next calendar/dashboard view. Without this, a deleted recurring slot reappears.
--
-- Times are stored as text ("HH:MM") to match the slots table's start_time/end_time exactly, so
-- the natural key (venue_id | date | start_time | end_time) lines up with a slot's key.

create table if not exists public.schedule_slot_exclusions (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  manager_id  uuid not null references auth.users(id)   on delete cascade,
  date        date not null,
  start_time  text not null,
  end_time    text not null,
  created_at  timestamptz not null default now(),
  unique (venue_id, date, start_time, end_time)
);

alter table public.schedule_slot_exclusions enable row level security;

-- A manager can read/write only exclusions for their own venues.
drop policy if exists "Managers manage own schedule exclusions" on public.schedule_slot_exclusions;
create policy "Managers manage own schedule exclusions"
  on public.schedule_slot_exclusions
  for all
  using (auth.uid() = manager_id)
  with check (auth.uid() = manager_id);
