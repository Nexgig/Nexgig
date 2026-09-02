import { supabase } from './supabase';

/**
 * Persist a gig-request booking to Supabase — the SINGLE source of truth for the `bookings`
 * insert done when a manager sends a draft to an artist. Shared by the manager calendar
 * (send drafts off a set card) AND the Add Set / Assign Artist pick screens (send in place),
 * so the row shape can never drift between those code paths. Carries the snapshot fields a
 * Booking holds (slot_date/name/times, venue_name/type) because the artist side reads those,
 * not the manager's live slot. Mirrors the local Booking created by the draft store.
 */
export async function persistGigRequestBooking(args: {
  bookingId: string;
  slotId: string;
  venueId: string;
  artistId: string;
  managerId: string;
  slotDate: string;
  slotName: string;
  slotStartTime: string;
  slotEndTime: string;
  price: number | null;
  venueName: string | null;
  venueType: string | null;
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    id: args.bookingId,
    slot_id: args.slotId,
    venue_id: args.venueId,
    artist_id: args.artistId,
    manager_id: args.managerId,
    status: 'requested',
    is_completed: false,
    slot_date: args.slotDate,
    slot_name: args.slotName,
    slot_start_time: args.slotStartTime,
    slot_end_time: args.slotEndTime,
    price: args.price,
    venue_name: args.venueName,
    venue_type: args.venueType,
  });
  if (error) console.warn('booking insert error:', JSON.stringify(error));
}
