-- ═══════════════════════════════════════════════════════════════════════════
-- bookings.status — add 'expired'.
--
-- WHY: a request nobody answered before the gig ended used to stay stored as 'requested'
-- with only a grey badge over it. It therefore still BEHAVED as pending everywhere that
-- reasons about state rather than badges — it sat in both pending lists, counted as a
-- conflict blocking the artist's availability indefinitely, and still offered Decline on
-- the artist's calendar, which notified the manager that the artist had declined a gig they
-- were never able to answer.
--
-- Making it a real status fixes all of those at once, because every one of those paths keys
-- off 'requested'. lib/expire-requests.ts does the flip; see there for the rule.
--
-- `status` had a CHECK constraint, so the value had to be allowed before the app could write
-- it. The block below finds the existing constraint by name rather than assuming
-- `bookings_status_check` — it only widens what is permitted, so no existing row can violate
-- the new version and it cannot fail partway.
--
-- NOTE 'past_confirmation' is NOT expired by the sweep: that status is only ever set
-- deliberately, and a manager's past booking request must stay answerable.
--
-- STATUS: deployed 20 Jul 2026.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare cname text;
begin
  select c.conname into cname
    from pg_constraint c
   where c.conrelid = 'public.bookings'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%status%';

  if cname is not null then
    execute format('alter table public.bookings drop constraint %I', cname);
  end if;

  alter table public.bookings
    add constraint bookings_status_check
    check (status = any (array[
      'requested', 'confirmed', 'completed', 'cancelled',
      'declined', 'past_confirmation', 'expired'
    ]));
end $$;
