-- ============================================================================
-- Safety-net rule for the invoice numbering (INV-<email letters>-<account tag>-
-- <NNN>). The app mints the running number from a live count and retries on
-- conflict; this is the FINAL backstop: the same artist can never end up with two
-- GENERATED invoices carrying the same number, even in a rare double-send race.
--
-- PARTIAL index (WHERE pdf_url IS NULL) so it applies ONLY to our generated
-- invoices. An UPLOADED invoice (pdf_url set) keeps the artist's OWN file name as
-- its reference and is exempt — two uploads can share a name, that's fine.
--
-- The app counts only generated invoices (pdf_url null), cancelled included, so a
-- generated number is never reused (a cancelled number retires, leaving a gap).
--
-- PREREQUISITE: no duplicate (artist_id, invoice_number) among GENERATED rows may
-- already exist (the dup-check across ALL rows already returned no rows, so this
-- holds). The drop makes it safe to re-run / replace an earlier plain version.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

drop index if exists invoices_artist_number_unique;

create unique index invoices_artist_number_unique
  on public.invoices (artist_id, invoice_number)
  where pdf_url is null;
