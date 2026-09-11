-- ============================================================================
-- Artists can UPLOAD their own invoice PDF (instead of the app-generated one).
-- When they do, the invoice row stores the public URL of that uploaded file here.
-- A NULL value = a normal app-generated invoice (unchanged behaviour).
--
-- SAFE + backward-compatible: the old app never references this column. Run it
-- alongside the invoice-PDF feature's app build.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

alter table public.invoices
  add column if not exists pdf_url text;
