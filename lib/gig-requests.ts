import { supabase } from './supabase';
import { useBookingStore, useDraftStore, useNotificationStore, generateUUID } from './store';
import type { Booking } from './types';
import { firstName } from './utils';
import { formatDate } from './conflict-detection';

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

/**
 * Send ONE drafted artist as a gig request: turn the draft into a local booking (via the draft
 * store), persist that booking to Supabase, and notify the artist. This is the SINGLE shared
 * implementation used by the calendar (set card + send sheet), the dashboard Overview day panel,
 * and the slot booking-detail — so the create → persist → notify sequence can never drift between
 * them. Returns the new booking id (undefined if the draft was already gone). Callers own the
 * confirm dialog and any looping. Reads the stores via getState() (not hooks), so it's callable
 * from any handler.
 */
export function sendDraftRequest(args: {
  slotId: string;
  artistId: string;
  managerId: string;
  managerName?: string | null;
  slot: { venueId: string; date: string; name: string; startTime: string; endTime: string };
  draftPrice?: number | null;
  venueName?: string | null;
  venueType?: string | null;
}): string | undefined {
  const { slotId, artistId, managerId, managerName, slot, draftPrice = null, venueName = null, venueType = null } = args;
  const addBooking = useBookingStore.getState().addBooking;
  const newBookingId = useDraftStore.getState().sendDraftByDJ(slotId, artistId, managerId, addBooking);
  if (!newBookingId) return undefined;
  // Fire-and-forget the Supabase write (matches every call site); errors are logged inside.
  void persistGigRequestBooking({
    bookingId: newBookingId, slotId, venueId: slot.venueId, artistId, managerId,
    slotDate: slot.date, slotName: slot.name, slotStartTime: slot.startTime, slotEndTime: slot.endTime,
    price: draftPrice, venueName, venueType,
  });
  useNotificationStore.getState().addNotification({
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: artistId,
    type: 'booking_request',
    title: 'New Booking Request',
    body: `${firstName(managerName ?? undefined, 'A manager')} wants you at ${venueName ?? 'a venue'}, ${formatDate(slot.date)}`,
    isRead: false,
    relatedId: newBookingId,
    relatedType: 'booking',
    createdAt: new Date().toISOString(),
  });
  return newBookingId;
}

/**
 * Add a one-time off-app GUEST DJ to a slot: a name-only, immediately-confirmed booking with no real
 * artist (artist_id null / artistId ''). No request, no notification, no invoice, no profile.
 * Persists to Supabase (guest_name column) like any booking. Returns the new booking id.
 */
export function addGuestBooking(args: {
  slotId: string;
  venueId: string;
  managerId: string;
  guestName: string;
  slotDate: string;
  slotName: string;
  slotStartTime: string;
  slotEndTime: string;
  venueName?: string | null;
  venueType?: string | null;
  price?: number | null;
}): string {
  const { slotId, venueId, managerId, slotDate, slotName, slotStartTime, slotEndTime, venueName = null, venueType = null, price = null } = args;
  const guestName = args.guestName.trim();
  const now = new Date().toISOString();
  const bookingId = generateUUID();
  const booking: Booking = {
    id: bookingId, slotId, venueId, artistId: '', managerId, guestName,
    status: 'confirmed', isCompleted: false, confirmedAt: now, createdAt: now, updatedAt: now,
    slotDate, slotName, slotStartTime, slotEndTime,
    price: price ?? undefined,
    venueName: venueName ?? undefined,
    venueType: (venueType ?? undefined) as Booking['venueType'],
  };
  useBookingStore.getState().addBooking(booking);
  void supabase.from('bookings').insert({
    id: bookingId, slot_id: slotId, venue_id: venueId, artist_id: null, manager_id: managerId,
    guest_name: guestName, status: 'confirmed', is_completed: false, confirmed_at: now,
    slot_date: slotDate, slot_name: slotName, slot_start_time: slotStartTime, slot_end_time: slotEndTime,
    price: price, venue_name: venueName, venue_type: venueType,
  }).then(({ error }) => { if (error) console.warn('guest booking insert error:', JSON.stringify(error)); });
  return bookingId;
}
