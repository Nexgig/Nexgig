-- ═══════════════════════════════════════════════════════════════════════════
-- get_slot_co_artists — lets an ARTIST see the other artists on a set they're on.
--
-- WHY an RPC: RLS blocks an artist from reading another artist's booking row, so the
-- artist's app has no way to know who else plays a set. This SECURITY DEFINER function
-- returns the roster for one slot — but ONLY the other artists' name + status, and ONLY
-- when the caller is themselves on that slot (the privacy gate below). No venue, no
-- manager, no contact details. Mirrors the shape of get_artist_busy_times.
--
-- Returns: one row per OTHER artist on the slot (excludes the caller and any
-- cancelled/declined booking).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_slot_co_artists(p_slot_id uuid)
returns table (artist_id uuid, full_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Privacy gate: only return anything if the CALLER is on this slot.
  if not exists (
    select 1 from public.bookings b
    where b.slot_id = p_slot_id
      and b.artist_id = auth.uid()
      and b.status not in ('cancelled', 'declined')
  ) then
    return;
  end if;

  return query
    select b.artist_id, a.full_name, b.status
    from public.bookings b
    join public.artists a on a.id = b.artist_id
    where b.slot_id = p_slot_id
      and b.artist_id <> auth.uid()
      and b.status not in ('cancelled', 'declined');
end;
$$;

grant execute on function public.get_slot_co_artists(uuid) to authenticated;

-- ── Verify (optional): should return nothing for a random uuid, and for a real slot
--    only when run as an artist who is on it. ──
-- select * from public.get_slot_co_artists('00000000-0000-0000-0000-000000000000');
