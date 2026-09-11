-- ============================================================================
-- Venues get one or more BILLING EMAILS — the address(es) an artist's invoice
-- for that venue is emailed to. Edited in the billing section (create-venue's
-- Billing step + the standalone Billing details page).
--
-- Stored as a jsonb array of strings (same column type + read pattern as
-- monthly_budgets): the app reads it as `Array.isArray(billing_emails) ? … : undefined`
-- in lib/store.ts (mapVenueRow) and lib/sync.ts (fetchVenues). Default '[]' means
-- existing venues read back as an empty list.
--
-- Delivery: the send-email Edge Function's `invoice_received` branch routes the
-- invoice to these addresses when set (after verifying the venue belongs to the
-- recipient manager); when empty it falls back to the manager's login email.
--
-- SAFE + backward-compatible: the old app never references this column. RUN THIS
-- BEFORE publishing the OTA — the new app SELECTs and INSERTs `billing_emails`,
-- so the column must already exist or venue create/edit writes fail.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

alter table public.venues
  add column if not exists billing_emails jsonb not null default '[]'::jsonb;
