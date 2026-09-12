-- ============================================================================
-- MIGRATE ARTIST MUSIC LINK — fold old Spotify/Mixcloud into the single link.
--
-- We consolidated the artist links into ONE "music that best describes me" link,
-- stored in `soundcloud_url`, and removed the Spotify + Mixcloud inputs. Existing
-- artists whose only music link was in `spotify_url` or `mixcloud_url` (with an
-- empty soundcloud_url) would otherwise show NO music link once those rows are
-- hidden. This copies the old Spotify (preferred) or Mixcloud link into the single
-- `soundcloud_url` field so nothing disappears.
--
-- Non-destructive: it only fills an EMPTY soundcloud_url, never overwrites one that
-- already has a link. The old spotify_url/mixcloud_url values are left in place
-- (just no longer displayed) — nothing is deleted.
--
-- Run STEP 1 first (read-only) to see who's affected, then STEP 2 to apply.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only). Who gets a music link folded in, and from where.
-- ────────────────────────────────────────────────────────────────────────────
select
  id,
  full_name,
  nullif(trim(spotify_url), '')  as old_spotify,
  nullif(trim(mixcloud_url), '') as old_mixcloud,
  coalesce(nullif(trim(spotify_url), ''), nullif(trim(mixcloud_url), '')) as will_become_music_link
from public.artists
where nullif(trim(soundcloud_url), '') is null
  and (nullif(trim(spotify_url), '') is not null or nullif(trim(mixcloud_url), '') is not null)
order by full_name;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2 — APPLY. Fills the empty music link (soundcloud_url) from Spotify, else
-- Mixcloud. Only touches the rows STEP 1 listed.
-- ────────────────────────────────────────────────────────────────────────────
update public.artists
set soundcloud_url = coalesce(nullif(trim(spotify_url), ''), nullif(trim(mixcloud_url), ''))
where nullif(trim(soundcloud_url), '') is null
  and (nullif(trim(spotify_url), '') is not null or nullif(trim(mixcloud_url), '') is not null);
