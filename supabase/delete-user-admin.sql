-- ============================================================================
-- ADMIN-SAFE USER DELETION — mirrors the app's "Delete Account" cleanup.
--
-- Fully removes ONE user (both roles + login) WITHOUT wrecking the other party's
-- data:
--   • UPCOMING gigs they're on are cancelled (no ghost future bookings);
--   • PAST / already-played gigs are KEPT (renamed to "Former Artist"/"Former
--     Manager") so they stay a record AND can still be invoiced by the other side;
--   • invoices are KEPT (see the FK note below — verify once with STEP B);
--   • a manager's venues are DEACTIVATED (kept as history), not deleted;
--   • they're removed from the manager allow-list so they can't re-signup.
--
-- IMPORTANT ASYMMETRY (why STEP A matters):
--   Only the ARTIST can raise an invoice. So deleting an ARTIST who has a past gig
--   that was never invoiced means that gig can NEVER be invoiced again in the app.
--   Deleting a MANAGER is safe on this point — the artist can still invoice.
--   → Run STEP A before deleting an artist; settle any uninvoiced gigs first.
--
-- RUN ORDER:  STEP A (preview, read-only)  →  STEP B (FK check, read-only, once)
--             →  STEP C (the actual deletion).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- STEP A — PREVIEW (read-only, changes nothing). Run this FIRST.
-- Lists every gig this person PLAYED but that has NO (non-cancelled) invoice yet,
-- and flags whether they're the artist (= at risk of being un-invoiceable).
-- If rows come back and "who" says ARTIST → invoice/settle those before deleting.
-- ────────────────────────────────────────────────────────────────────────────
with me as (
  select id from auth.users where lower(email) = lower(trim('PASTE-THE-EMAIL-HERE'))
),
invoiced as (   -- booking ids already covered by a live (non-cancelled) invoice
  select g->>'bookingId' as booking_id
  from public.invoices i, jsonb_array_elements(i.gigs) g
  where i.status <> 'cancelled'
),
b as (
  select bk.*,
    coalesce(s.date, bk.slot_date)                                         as d,
    coalesce(nullif(trim(s.start_time),''), nullif(trim(bk.slot_start_time),''), '00:00')::time as st,
    coalesce(nullif(trim(s.end_time),''),   nullif(trim(bk.slot_end_time),''))::time            as et
  from public.bookings bk
  left join public.slots s on s.id = bk.slot_id
  where bk.artist_id = (select id from me) or bk.manager_id = (select id from me)
)
select
  b.d as gig_date, b.venue_name, b.status, b.artist_name, b.manager_name,
  case when b.artist_id = (select id from me)
       then 'THIS USER is the ARTIST → at risk (only they can invoice it)'
       else 'this user is the MANAGER → artist can still invoice, safe' end as who
from b
where b.id not in (select booking_id from invoiced)
  and (
    b.status = 'completed'
    or (b.status = 'confirmed' and
        (case when b.et is null then (b.d + b.st)
              when b.et < b.st  then (b.d + b.et + interval '1 day')
              else (b.d + b.et) end) < (now() at time zone 'Asia/Dubai'))
  )
order by b.d desc;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP B — FK CHECK (read-only). Run ONCE, ever, to confirm the deletion is safe.
-- The `invoices` table isn't defined in the repo, so we can't see from code what
-- happens to invoices when a user is deleted. This shows it. You want SET NULL.
--   SET NULL  → invoice kept, link cleared (what we want)
--   CASCADE   → DANGER: deleting the user DELETES their invoices (money records)
--   RESTRICT / NO ACTION → deletion is BLOCKED if any invoice references them
-- Paste the result to me and I'll confirm the deletion block below is safe as-is.
-- ────────────────────────────────────────────────────────────────────────────
select
  con.conname                              as fk_name,
  ref.relname                              as points_to_table,
  att.attname                              as invoices_column,
  case con.confdeltype
    when 'n' then 'SET NULL  — safe: invoice kept, link cleared'
    when 'c' then 'CASCADE   — DANGER: deleting the user DELETES the invoice'
    when 'r' then 'RESTRICT  — blocks deleting the user if any invoice exists'
    when 'a' then 'NO ACTION — blocks deleting the user if any invoice exists'
    when 'd' then 'SET DEFAULT'
  end                                      as on_user_delete
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid and rel.relname = 'invoices'
join pg_class ref on ref.oid = con.confrelid
join unnest(con.conkey) as k(attnum) on true
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
where con.contype = 'f'
order by con.conname;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP C — THE DELETION. Put the email on the target_email line, run the block.
-- Atomic: any error rolls it ALL back, so you never get a half-deleted user.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  target_email text := 'PASTE-THE-EMAIL-HERE';   -- the user to delete (their login email)
  target_id    uuid;
  now_iso      timestamptz := now();
  future_ids   uuid[];                            -- only UPCOMING gigs get cancelled
begin
  select id into target_id from auth.users where lower(email) = lower(trim(target_email));
  if target_id is null then
    raise exception 'No user found for email %', target_email;
  end if;

  -- Which of their active gigs are still UPCOMING (end time in the future, Dubai)?
  -- Past/played gigs are deliberately excluded so we never cancel a performed gig.
  -- End-time logic (incl. the overnight roll) mirrors complete_past_bookings().
  select array_agg(bk.id) into future_ids
  from public.bookings bk
  left join public.slots s on s.id = bk.slot_id
  where (bk.artist_id = target_id or bk.manager_id = target_id)
    and bk.status in ('requested','past_confirmation','confirmed')
    and (case
           when coalesce(nullif(trim(s.end_time),''), nullif(trim(bk.slot_end_time),'')) is null
             then coalesce(s.date, bk.slot_date)
                  + coalesce(nullif(trim(s.start_time),''), nullif(trim(bk.slot_start_time),''), '00:00')::time
           when coalesce(nullif(trim(s.end_time),''), nullif(trim(bk.slot_end_time),''))::time
                < coalesce(nullif(trim(s.start_time),''), nullif(trim(bk.slot_start_time),''), '00:00')::time
             then coalesce(s.date, bk.slot_date)
                  + coalesce(nullif(trim(s.end_time),''), nullif(trim(bk.slot_end_time),''))::time
                  + interval '1 day'
           else coalesce(s.date, bk.slot_date)
                + coalesce(nullif(trim(s.end_time),''), nullif(trim(bk.slot_end_time),''))::time
         end) >= (now() at time zone 'Asia/Dubai');

  -- Cancel ONLY those upcoming gigs.
  update public.bookings set status = 'cancelled', cancelled_at = now_iso
    where id = any(future_ids);

  -- ── Artist-side rename + cleanup (does nothing if they're not an artist) ──
  update public.bookings          set artist_name = 'Former Artist' where artist_id = target_id;
  update public.global_lineup     set artist_name = 'Former Artist' where artist_id = target_id;
  update public.venue_assignments set artist_name = 'Former Artist' where artist_id = target_id;
  delete from public.availability_blocks where artist_id = target_id;
  delete from public.applications        where artist_id = target_id;
  delete from public.draft_assignments   where artist_id = target_id;

  -- ── Manager-side rename + cleanup (does nothing if they're not a manager) ──
  update public.bookings          set manager_name = 'Former Manager' where manager_id = target_id;
  update public.global_lineup     set manager_name = 'Former Manager' where manager_id = target_id;
  update public.venue_assignments set manager_name = 'Former Manager' where manager_id = target_id;
  update public.venues set is_deactivated = true, manager_name = 'Former Manager' where manager_id = target_id;
  delete from public.applications      where manager_id = target_id;
  delete from public.draft_assignments where manager_id = target_id;

  -- ── Identity + shared rows ──
  delete from public.managers          where id = target_id;
  delete from public.artists           where id = target_id;
  delete from public.notifications     where user_id = target_id;
  delete from public.manager_allowlist where lower(email) = lower(trim(target_email));  -- so they can't re-signup
  delete from public.users             where id = target_id;

  -- ── Finally the login (removes their auth sessions/identities too).
  --    Past bookings + invoices stay as a record; only the departing name is
  --    changed to "Former X" above. ──
  delete from auth.users where id = target_id;

  raise notice 'Deleted % (%). Upcoming gigs cancelled: %',
    target_email, target_id, coalesce(array_length(future_ids, 1), 0);
end $$;

-- OPTIONAL: their uploaded photo files aren't removed by the block above. If you
-- want to clear them too, delete `avatar-<their user id>…` from the avatars bucket
-- and their venue photos from the venue-photos bucket in Storage. (Cosmetic — the
-- account and all its data are already gone.)
