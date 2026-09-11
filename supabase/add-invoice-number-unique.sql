-- ============================================================================
-- Safety-net rule for the new invoice numbering (INV-<email letters>-<account
-- tag>-<NNN>). The app mints the running number from a live count and retries on
-- conflict, but this is the FINAL backstop: the same artist can never end up with
-- two invoices carrying the same number, even in a rare double-send race.
--
-- The app counts EVERY invoice row (cancelled included) so a number is never
-- reused — a cancelled invoice's number is retired (leaves a gap), which is why a
-- plain unique index (not a partial one) is correct here.
--
-- PREREQUISITE: no duplicate (artist_id, invoice_number) pairs may already exist,
-- or this index creation errors. The check that must return NO rows first:
--   select artist_id, invoice_number, count(*)
--   from public.invoices
--   group by artist_id, invoice_number
--   having count(*) > 1;
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

create unique index if not exists invoices_artist_number_unique
  on public.invoices (artist_id, invoice_number);
