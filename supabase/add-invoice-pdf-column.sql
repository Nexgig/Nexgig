-- ============================================================================
-- Artists can UPLOAD their own invoice (a photo of it) instead of the
-- app-generated one. When they do, the invoice row stores the public URL of the
-- uploaded file here. A NULL value = a normal app-generated invoice (unchanged).
-- (Column name is generic — it holds an image URL on the current app version and
--  a PDF URL on the later native build; either way it's "the uploaded file".)
--
-- SAFE + backward-compatible: the old app never references this column.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

alter table public.invoices
  add column if not exists pdf_url text;
