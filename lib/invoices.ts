import type { Booking, Invoice } from './types';

/**
 * Booking ids covered by a real, non-cancelled invoice owned by `artistId`. A booking id only
 * ever appears in invoices for its own venue, so this global set is safe to membership-test
 * against a booking from any venue. Cancelled invoices are excluded, so their gigs are invoiceable
 * again.
 */
export function realInvoicedBookingIds(invoices: Invoice[], artistId: string | undefined): Set<string> {
  return new Set(
    invoices
      .filter((inv) => inv.artistId === artistId && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
  );
}

/**
 * Whether a completed gig counts as "invoiced" on the ARTIST side: a real (non-cancelled) invoice
 * covers it, OR the artist manually marked it invoiced (billed outside the app). `realInvoicedIds`
 * is any set of really-invoiced booking ids — global (from realInvoicedBookingIds) or a
 * venue-scoped set both work, since a booking only appears in its own venue's invoices.
 *
 * Manager-side reads must NOT use this — a manual mark is private to the artist, so managers keep
 * deriving "invoiced" from real invoices only.
 */
export function isGigInvoicedForArtist(booking: Booking, realInvoicedIds: Set<string>): boolean {
  return realInvoicedIds.has(booking.id) || !!booking.manuallyInvoiced;
}
