-- ============================================================================
-- TIGHTEN RLS — close two read leaks + tidy duplicate policies.
--
-- Verified against the app (which screens read venues/slots) before writing this,
-- so nothing the app needs is taken away. It's DDL (no result set) — run it as one
-- block. A ROLLBACK section at the bottom restores the old policies if needed.
--
--   A) SLOTS  — were world-readable (even logged-out), exposing default_price (fees).
--               The app: only managers read slots (filtered to their own); artists
--               never read slots directly. → lock to the owning manager.
--   B) VENUES — were readable by ANY logged-in user, exposing every venue's
--               monthly_budgets + billing details. The app: a venue is only ever
--               read by its manager, or by an artist connected to it (assigned, or
--               has a booking/invoice there). → scope reads to those people.
--   C) USERS  — had 8 duplicate policies all saying "own row only". → fold to 3.
--
-- NOTE (residual): after (B), an artist CONNECTED to a venue can still read that
-- venue's row, which includes monthly_budgets/billing_emails (RLS is row-level, not
-- column-level). Fully hiding budgets even from connected artists needs a small
-- schema split — a separate follow-up, noted to you in chat.
-- ============================================================================


-- ── A) SLOTS — manager-only. Drop the two broad SELECT policies; the existing
--    "Managers can manage their slots" (FOR ALL, manager_id = auth.uid()) already
--    covers the owner's reads, and no artist screen reads slots. ──
drop policy if exists "Artists can view slots"            on public.slots;
drop policy if exists "Authenticated users can read slots" on public.slots;


-- ── B) VENUES — replace the "any authenticated user" read with a connection check. ──
drop policy if exists "Authenticated users can read venues" on public.venues;

create policy "Read venues you're connected to" on public.venues
  for select
  using (
    auth.uid() = manager_id
    or exists (select 1 from public.venue_assignments va where va.venue_id = venues.id and va.artist_id = auth.uid())
    or exists (select 1 from public.bookings         b  where b.venue_id  = venues.id and b.artist_id  = auth.uid())
    or exists (select 1 from public.invoices         i  where i.venue_id  = venues.id and i.artist_id  = auth.uid())
  );


-- ── C) USERS — collapse 8 duplicate policies into a clean 3 (same behaviour: own row only). ──
drop policy if exists "Users can insert their own profile" on public.users;
drop policy if exists "Users can insert own record"        on public.users;
drop policy if exists "Users can read own data"            on public.users;
drop policy if exists "Users can read own record"          on public.users;
drop policy if exists "Users can read their own profile"   on public.users;
drop policy if exists "Users can update own record"        on public.users;
drop policy if exists "Users can update own data"          on public.users;
drop policy if exists "Users can update their own profile" on public.users;

create policy "Users read own row"   on public.users for select using (auth.uid() = id);
create policy "Users update own row" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users insert own row" on public.users for insert with check (auth.uid() = id);


-- ============================================================================
-- ROLLBACK (only if something breaks — restores the previous, looser policies):
--
-- create policy "Artists can view slots"             on public.slots  for select using (true);
-- create policy "Authenticated users can read slots" on public.slots  for select using (auth.role() = 'authenticated');
-- drop   policy if exists "Read venues you're connected to" on public.venues;
-- create policy "Authenticated users can read venues" on public.venues for select using (auth.role() = 'authenticated');
-- (the users policies were exact duplicates; the 3 clean ones behave identically, so no rollback needed there.)
-- ============================================================================
