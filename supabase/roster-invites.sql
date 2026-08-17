-- ============================================================================
-- Roster invites — invite an artist by EMAIL even if they aren't on Nexgig yet.
-- The manager creates a pending invite (email + name + chosen venues) and the
-- invitee gets an email with the App Store link. When they sign up as an artist
-- with that email, claim_roster_invites() adds them to the manager's roster +
-- the picked venues and marks the invite accepted.
-- Run this whole block once in the Supabase SQL editor.
-- ============================================================================

-- 1. Pending-invite table -----------------------------------------------------
create table if not exists public.roster_invites (
  id                 uuid primary key default gen_random_uuid(),
  manager_id         uuid not null references auth.users(id) on delete cascade,
  manager_name       text,
  email              text not null,
  artist_name        text,
  venue_ids          uuid[] not null default '{}',
  status             text not null default 'pending',   -- 'pending' | 'accepted' | 'cancelled'
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  accepted_artist_id uuid
);

-- At most ONE live (pending) invite per manager + email.
create unique index if not exists roster_invites_manager_email_pending
  on public.roster_invites (manager_id, lower(email))
  where status = 'pending';

-- Fast lookup by email at claim time.
create index if not exists roster_invites_email_idx
  on public.roster_invites (lower(email));

-- 2. RLS: a manager only ever sees / manages their OWN invites. The invitee never
--    touches this table directly — the claim goes through the function in step 3.
alter table public.roster_invites enable row level security;

drop policy if exists roster_invites_select_own on public.roster_invites;
create policy roster_invites_select_own on public.roster_invites
  for select using (manager_id = auth.uid());

drop policy if exists roster_invites_insert_own on public.roster_invites;
create policy roster_invites_insert_own on public.roster_invites
  for insert with check (
    manager_id = auth.uid()
    and exists (select 1 from public.managers where id = auth.uid())
  );

drop policy if exists roster_invites_update_own on public.roster_invites;
create policy roster_invites_update_own on public.roster_invites
  for update using (manager_id = auth.uid());

drop policy if exists roster_invites_delete_own on public.roster_invites;
create policy roster_invites_delete_own on public.roster_invites
  for delete using (manager_id = auth.uid());

-- 3. Claim — called by the NEW ARTIST at signup. Finds pending invites addressed
--    to THEIR email (from their JWT), adds them to each manager's roster + the
--    picked venues, marks the invite accepted, and returns the claimed invites so
--    the app can notify the managers. SECURITY DEFINER so it can write the roster
--    rows; it can only ever act on invites matching the caller's own email.
create or replace function public.claim_roster_invites()
returns table (out_manager_id uuid, out_manager_name text, out_artist_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_ok    boolean;
  inv     record;
begin
  if v_uid is null or v_email is null then
    return;
  end if;

  -- SECURITY: only auto-claim when the email is PROVIDER-VERIFIED (signed up via Apple or
  -- Google, which verify the address). Email confirmation is currently OFF, so an
  -- email/password signup does NOT prove the person owns the address — trusting it would
  -- let someone register an invited email they don't own and hijack the invite. Those
  -- accounts just don't auto-claim; the invite stays pending.
  -- NOTE: with confirmation OFF, email_confirmed_at is auto-set at signup and proves
  -- nothing — do NOT gate on it. Once you ENABLE email confirmation you can additionally
  -- trust confirmed email/password by appending:  or email_confirmed_at is not null
  select (
    coalesce(raw_app_meta_data ->> 'provider', '') in ('apple', 'google')
    or coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) ?| array['apple', 'google']
  ) into v_ok
  from auth.users where id = v_uid;
  if not coalesce(v_ok, false) then
    return;
  end if;

  for inv in
    select * from public.roster_invites
    where status = 'pending' and lower(email) = v_email
  loop
    -- Roster (dedupe on manager+artist).
    insert into public.global_lineup (manager_id, artist_id, status)
    values (inv.manager_id, v_uid, 'active')
    on conflict (manager_id, artist_id) do update set status = 'active';

    -- Venue assignments — only venues that still exist and belong to this manager.
    insert into public.venue_assignments (manager_id, artist_id, venue_id, status)
    select inv.manager_id, v_uid, ve.id, 'active'
    from public.venues ve
    where ve.id = any (inv.venue_ids) and ve.manager_id = inv.manager_id
    on conflict (venue_id, artist_id) do update set status = 'active';

    -- Mark accepted.
    update public.roster_invites
      set status = 'accepted', accepted_at = now(), accepted_artist_id = v_uid
      where id = inv.id;

    out_manager_id   := inv.manager_id;
    out_manager_name := inv.manager_name;
    out_artist_name  := inv.artist_name;
    return next;
  end loop;
end;
$$;

grant execute on function public.claim_roster_invites() to authenticated;
