import { supabase } from './supabase';
import { isPastEnd } from './utils';
import type { Booking } from './types';

/**
 * Private events are stored in the `availability_blocks` table (block_type = 'private_event'),
 * NOT in the `bookings` table. The calendar renders them as artist-created bookings, so every
 * code path that loads or refreshes the artist calendar must reconstruct them — otherwise they
 * silently vanish (a bookings-only fetch never returns them).
 *
 * This is the single source of truth for that reconstruction. The row `id` is reused as the
 * booking `id` (add-block links them by the same id), so the booking store's upsert dedupes
 * against any persisted copy instead of creating a duplicate.
 */
export async function fetchPrivateEventBookings(artistId: string): Promise<Booking[]> {
  const { data } = await supabase
    .from('availability_blocks')
    .select('id, date, start_time, end_time, is_full_day, block_type, event_name, location, occasion')
    .eq('artist_id', artistId)
    .eq('block_type', 'private_event');

  return (data ?? []).map((b: any) => {
    const start = b.is_full_day ? '00:00' : b.start_time;
    const end = b.is_full_day ? '23:59' : b.end_time;
    const nowISO = new Date().toISOString();
    return {
      id: b.id,
      slotId: 'private-slot-' + b.id,
      venueId: '',
      artistId,
      managerId: '',
      status: 'confirmed',
      isCompleted: isPastEnd(b.date, start, end),
      isArtistCreated: true,
      createdAt: nowISO,
      updatedAt: nowISO,
      confirmedAt: nowISO,
      slotDate: b.date,
      slotStartTime: start,
      slotEndTime: end,
      slotName: b.event_name ?? 'Private Event',
      venueName: b.event_name ?? 'Private Event',
      privateEventLocation: b.location ?? undefined,
      privateEventOccasion: b.occasion ?? undefined,
    } as Booking;
  });
}
