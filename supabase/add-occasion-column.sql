-- ============================================================================
-- Private events get an OCCASION (Club, Wedding, Birthday, …) that drives the
-- icon shown on the event's tile (artist calendar, dashboard, booking detail).
--
-- Private events are stored in availability_blocks (block_type = 'private_event').
-- This adds one nullable text column to hold the occasion KEY (see lib/occasions.ts:
-- 'club' | 'party' | 'wedding' | 'birthday' | 'corporate' | 'brunch' | 'sunset' |
-- 'dinner' | 'other'). Existing rows stay NULL and render the neutral 'event' icon
-- until edited.
--
-- SAFE + backward-compatible: the old app never references this column. RUN THIS
-- BEFORE publishing the OTA — the new app SELECTs and INSERTs `occasion`, so the
-- column must already exist or private-event reads/writes fail.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================================

alter table public.availability_blocks
  add column if not exists occasion text;
