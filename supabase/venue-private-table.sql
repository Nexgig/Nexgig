-- ============================================================================
-- MOVE venue budgets + billing emails into a MANAGER-ONLY table.
--
-- `monthly_budgets` and `billing_emails` currently live on `venues`, whose rows a
-- connected artist can read (RLS is row-level). This moves them into a separate
-- `venue_private` table that ONLY the owning manager can read — so budgets/billing
-- emails are fully confidential, even from artists who work at the venue.
--
-- RUN ORDER (important — do NOT skip step 2 or 3):
--   1. PART 1 now  → creates the locked table + copies the data over.
--   2. Claude ships the app code (OTA) + redeploys the send-email function to read
--      the new table, and you verify budgets + invoice emails still work.
--   3. PART 2 THEN → drops the two columns from `venues`, closing the leak for good.
-- Between step 1 and 3 the app keeps working either way (columns still there).
-- ============================================================================


-- ── PART 1 — create the locked table + migrate the data. Run now. ──
create table if not exists public.venue_private (
  venue_id        uuid primary key references public.venues(id) on delete cascade,
  manager_id      uuid not null,
  monthly_budgets jsonb,
  billing_emails  jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.venue_private enable row level security;

drop policy if exists "Managers manage their venue_private" on public.venue_private;
create policy "Managers manage their venue_private" on public.venue_private
  for all
  using (auth.uid() = manager_id)
  with check (auth.uid() = manager_id);

grant select, insert, update, delete on public.venue_private to authenticated;

-- Copy existing data over (one row per venue).
insert into public.venue_private (venue_id, manager_id, monthly_budgets, billing_emails)
select id, manager_id, monthly_budgets, billing_emails
from public.venues
on conflict (venue_id) do update
  set monthly_budgets = excluded.monthly_budgets,
      billing_emails  = excluded.billing_emails;


-- ── PART 2 — ONLY after the app + send-email function are live and verified. ──
-- ── Uncomment and run this to remove the columns from venues (closes the leak). ──
-- alter table public.venues drop column if exists monthly_budgets;
-- alter table public.venues drop column if exists billing_emails;
