-- ═══════════════════════════════════════════════════════════════════════════
-- Server-side auto-complete for past bookings.
--
-- STATUS: DEPLOYED 17 Jul 2026 — pg_cron enabled, function created, job armed
-- (jobid 1, 'complete-past-bookings', '0 * * * *', active). This file is kept as
-- the record of what was run + the rollback. Re-running STEP 1 is safe (it's
-- CREATE OR REPLACE); re-running STEP 2 would error on the duplicate job name.
--
-- WHY: `completed` was only ever set by a client-side sweep in the two
-- dashboards (app/(manager)/(tabs)/dashboard.tsx, app/(artist)/(tabs)/dashboard.tsx).
-- A gig whose end time had passed stayed `confirmed` in the DB until somebody
-- opened an app. This is the backstop. The client sweeps STAY — they give the
-- instant flip on open; this catches everything else.
--
-- MIRRORS THE CLIENT EXACTLY — keep in lockstep with isPastEnd() in lib/utils.ts:
--
--   1. confirmed + END datetime (Dubai wall-clock) in the past → completed.
--      END, not start: completion is what triggers the gig review, so it must not
--      fire mid-set.
--   2. OVERNIGHT ROLL: end_time < start_time means the gig ends the NEXT DAY.
--      The defaults are 20:00–00:00 and 21:00–01:00, so this is the common case,
--      not an edge case. Without it a 22:00–03:00 gig "ends" 19h before it starts.
--      STRICTLY `<`, not `<=`: a zero-length slot (end = start) ends the moment it
--      starts, it does not run 24h. Matches slotEndDateTimeStr() and timesOverlap().
--   3. No end_time (legacy rows) falls back to the start datetime — the old
--      behaviour, so nothing regresses.
--   4. Re-stamp the booking's snapshot columns from the live slot/venue. This half
--      is easy to miss: editing a set updates `slots` but NOT the booking's
--      snapshot, and the sweep is the only thing that repairs the drift.
--
-- DELIBERATELY NOT TOUCHED:
--   - `past_confirmation` / `requested` — those need the artist to confirm.
--   - private events — they live in `availability_blocks`, not `bookings`.
--
-- Run order: STEP 0 (read-only) → STEP 1 → STEP 2 → STEP 3.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 0 — DRY RUN. Read-only, changes nothing. Run this first.
--   (a) tells us whether the `is_artist_created` column exists on bookings
--   (b) lists every booking the job would flip right now, showing the computed
--       end time and whether the overnight roll applied — eyeball this before
--       running anything else.
-- ───────────────────────────────────────────────────────────────────────────

-- (a)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in ('is_artist_created', 'is_completed', 'slot_date', 'slot_start_time', 'slot_end_time');

-- (b)
--
-- VERIFIED SCHEMA (17 Jul 2026): slots.date + bookings.slot_date are `date`;
-- start_time/end_time/slot_start_time/slot_end_time are all `text` holding 'HH:MM'.
-- Hence the ::time casts below — and the nullif(trim(...),'') guards, because casting
-- an empty-string text column to time throws and would kill the whole cron run.
with resolved as (
  select
    b.id,
    b.status,
    b.venue_name  as snapshot_venue,
    v.name        as live_venue,
    coalesce(s.date, b.slot_date)                                        as d,
    coalesce(nullif(trim(s.start_time), ''),
             nullif(trim(b.slot_start_time), ''), '00:00')::time         as st,
    coalesce(nullif(trim(s.end_time), ''),
             nullif(trim(b.slot_end_time), ''))::time                    as et
  from public.bookings b
  left join public.slots  s on s.id = b.slot_id
  left join public.venues v on v.id = b.venue_id
  where b.status = 'confirmed'
    and coalesce(b.is_completed, false) = false
    and coalesce(s.date, b.slot_date) is not null
)
select
  id, status, d as gig_date, st as starts, et as ends,
  (et is not null and et < st)                      as overnight_roll,
  snapshot_venue, live_venue,
  case
    when et is null then (d + st)
    when et < st    then (d + et + interval '1 day')
    else (d + et)
  end                                               as ends_at_dubai
from resolved
where case
        when et is null then (d + st)
        when et < st    then (d + et + interval '1 day')
        else (d + et)
      end < (now() at time zone 'Asia/Dubai')
order by ends_at_dubai desc;


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1 — the function.
--
-- SECURITY DEFINER so it runs as the owner and is not filtered by RLS
-- (RLS on bookings is auth.uid()-based; a cron job has no auth.uid()).
-- Returns the number of rows flipped, so the cron run log is useful.
--
-- Schema verified 17 Jul 2026: `is_artist_created`, `is_completed`, `slot_date`,
-- `slot_start_time`, `slot_end_time` all exist on bookings — run as-is.
--
-- The end-time expression below (incl. the overnight roll) was verified against
-- all 8 cases from the isPastEnd() tests in __tests__/smoke.test.ts, run as literals
-- in the SQL editor. All PASS. Keep the two in lockstep.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  flipped integer;
begin
  with resolved as (
    select
      b.id,
      coalesce(s.date, b.slot_date)                                as d,
      coalesce(nullif(trim(s.start_time), ''),
               nullif(trim(b.slot_start_time), ''), '00:00')::time as st,
      coalesce(nullif(trim(s.end_time), ''),
               nullif(trim(b.slot_end_time), ''))::time            as et,
      coalesce(s.name, b.slot_name)                                as new_slot_name,
      coalesce(v.name, b.venue_name)                               as new_venue_name
    from public.bookings b
    left join public.slots  s on s.id = b.slot_id
    left join public.venues v on v.id = b.venue_id
    where b.status = 'confirmed'
      and coalesce(b.is_completed, false) = false
      and coalesce(b.is_artist_created, false) = false
      and coalesce(s.date, b.slot_date) is not null
  ),
  due as (
    select *
    from resolved
    where case
            when et is null then (d + st)                    -- legacy: no end time, fall back to start
            when et < st    then (d + et + interval '1 day') -- overnight gig: ends next day
            else (d + et)                                    -- incl. et = st: zero-length, ends instantly
          end < (now() at time zone 'Asia/Dubai')
  )
  update public.bookings b
  set status          = 'completed',
      is_completed    = true,
      -- re-stamp the snapshot, same as the client sweep does
      slot_date       = due.d,
      slot_name       = due.new_slot_name,
      slot_start_time = to_char(due.st, 'HH24:MI'),
      slot_end_time   = case when due.et is null then b.slot_end_time else to_char(due.et, 'HH24:MI') end,
      venue_name      = due.new_venue_name,
      updated_at      = now()
  from due
  where b.id = due.id;

  get diagnostics flipped = row_count;
  return flipped;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2 — schedule it hourly.
--
-- Enable pg_cron FIRST via the Supabase dashboard: Database → Extensions →
-- search "pg_cron" → toggle on. Then run this.
--
-- Hourly is deliberate: the client sweep already handles the live case the
-- instant anyone opens the app, so this only needs to catch the stragglers.
-- ───────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'complete-past-bookings',
  '0 * * * *',
  $$select public.complete_past_bookings()$$
);


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3 — verify.
-- ───────────────────────────────────────────────────────────────────────────

-- the job is registered:
select jobid, jobname, schedule, active from cron.job where jobname = 'complete-past-bookings';

-- run it once by hand right now (returns the number of rows flipped —
-- should match the row count STEP 0(b) showed):
select public.complete_past_bookings();

-- last few runs, once the hour has ticked over:
select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'complete-past-bookings')
order by start_time desc
limit 5;


-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK, if it ever misbehaves:
--   select cron.unschedule('complete-past-bookings');
--   drop function public.complete_past_bookings();
-- Unscheduling alone is enough to stop it; the client sweeps keep working.
-- ───────────────────────────────────────────────────────────────────────────
