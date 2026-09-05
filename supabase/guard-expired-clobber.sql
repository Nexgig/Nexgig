-- ═══════════════════════════════════════════════════════════════════════════
-- Guard: never let a stale client clobber a real booking to 'expired'.
--
-- WHY: the client-side sweepExpiredRequests (lib/expire-requests.ts) flips an
-- unanswered 'requested' gig to 'expired' once its date has passed. It decided
-- from the LOCAL store copy and wrote 'expired' keyed only on id — so a STALE
-- local 'requested' snapshot (from before a confirmation synced to that device)
-- could overwrite a real CONFIRMED/COMPLETED booking to 'expired'. That wrongly
-- expired a completed gig (Monkey Bar, 29 Aug 2026) and made it un-invoiceable.
--
-- The app fix (commit 84186eb) guards the write, but only protects a user once
-- their app has that bundle. This DB trigger protects EVERY client — live +
-- preview, any app version — immediately: a flip to 'expired' is allowed ONLY
-- when the row is CURRENTLY 'requested' and was NEVER confirmed. Otherwise the
-- real status is kept and the bad flip is silently ignored.
--
-- SAFE + reversible. Legit expiry (requested + never confirmed → expired) still
-- works untouched; the trigger only fires on a transition INTO 'expired', and
-- only reverts the ones that shouldn't happen. Once the app fix is live
-- everywhere it can be dropped (or kept as defense in depth). ROLLBACK below.
--
-- STATUS: handed to Tuts 5 Sep 2026 to run in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_expired_clobber()
returns trigger
language plpgsql
as $$
begin
  -- Only a booking that is CURRENTLY a pending request and was NEVER confirmed
  -- may become 'expired'. Anything else keeps its real status.
  if new.status = 'expired'
     and (old.confirmed_at is not null or old.status is distinct from 'requested') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_expired_clobber on public.bookings;

create trigger guard_expired_clobber
  before update on public.bookings
  for each row
  when (new.status = 'expired' and old.status is distinct from 'expired')
  execute function public.guard_expired_clobber();


-- ── VERIFY (read-only): the trigger is registered ──────────────────────────
-- select tgname, tgenabled
-- from pg_trigger
-- where tgrelid = 'public.bookings'::regclass and tgname = 'guard_expired_clobber';

-- ── ROLLBACK (once the app fix is live everywhere, if you want to remove it) ─
-- drop trigger  if exists guard_expired_clobber on public.bookings;
-- drop function if exists public.guard_expired_clobber();
