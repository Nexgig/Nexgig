import type { Booking, Slot, Venue } from '@/lib/types';
import { bookingVenueName } from '@/lib/utils';

export type PastGig = { id: string; date: string; startTime: string; endTime: string; earnings: number; name?: string };
export type PastVenue = { key: string; name: string; earnings: number; gigCount: number; gigs: PastGig[] };
export type PastMonth = { key: string; label: string; earnings: number; gigCount: number; venues: PastVenue[] };

/**
 * Completed gigs grouped by month (newest first), and within each month by venue — the
 * "Past bookings" earnings history. Shared by the artist dashboard (to gate the link) and the
 * Past bookings page (to render it). `bookings` should already be filtered to the artist.
 * A gig counts when it's completed (status 'completed' or isCompleted); its date/venue fall back
 * to the snapshot saved on the booking when the live slot/venue isn't in the store.
 */
export function computePastMonths(bookings: Booking[], slots: Slot[], venues: Venue[]): PastMonth[] {
  type M = { key: string; label: string; earnings: number; gigCount: number; venues: Map<string, PastVenue> };
  const months = new Map<string, M>();
  for (const b of bookings) {
    const isDone = b.status === 'completed' || b.isCompleted;
    if (!isDone) continue;
    const slot = slots.find((s) => s.id === b.slotId);
    const date = slot?.date ?? b.slotDate ?? '';
    if (!date) continue;
    const startTime = slot?.startTime ?? b.slotStartTime ?? '';
    const endTime = slot?.endTime ?? b.slotEndTime ?? '';
    const mKey = date.slice(0, 7); // YYYY-MM
    let m = months.get(mKey);
    if (!m) {
      m = {
        key: mKey,
        label: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        earnings: 0, gigCount: 0, venues: new Map(),
      };
      months.set(mKey, m);
    }
    const venue = venues.find((v) => v.id === b.venueId);
    const vKey = b.isArtistCreated ? '__private__' : (b.venueId ?? '__unknown__');
    const vName = b.isArtistCreated ? 'Private events' : bookingVenueName(b, venue?.name);
    let v = m.venues.get(vKey);
    if (!v) { v = { key: vKey, name: vName, earnings: 0, gigCount: 0, gigs: [] }; m.venues.set(vKey, v); }
    const price = b.price ?? 0;
    v.gigs.push({ id: b.id, date, startTime, endTime, earnings: price, name: b.isArtistCreated ? (b.slotName ?? 'Private Booking') : undefined });
    v.earnings += price; v.gigCount++;
    m.earnings += price; m.gigCount++;
  }
  return Array.from(months.values())
    .sort((a, b) => (a.key < b.key ? 1 : -1)) // newest month first
    .map((m) => ({
      key: m.key, label: m.label, earnings: m.earnings, gigCount: m.gigCount,
      venues: Array.from(m.venues.values())
        .map((v) => ({ ...v, gigs: v.gigs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) })) // newest gig first
        .sort((x, y) => y.earnings - x.earnings),
    }));
}
