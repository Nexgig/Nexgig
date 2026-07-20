import { useBookingStore } from './store';
import { syncBookingStatus } from './booking-sync';
import { isExpiredRequest } from './utils';

/**
 * Flip unanswered requests to `expired` once their gig has finished.
 *
 * Expiry started as display-only — a grey badge over a booking still stored as `requested`.
 * That left it *behaving* as pending everywhere that reasons about state rather than about
 * badges: it stayed in both pending lists, still counted as a conflict blocking the artist's
 * availability, and still offered Decline on the artist's calendar — which notified the
 * manager that the artist had declined a gig they were never able to answer.
 *
 * Making it a real status fixes all of those at once, because every one of those code paths
 * keys off `requested`. That is the point: one state change instead of chasing each screen.
 *
 * `past_confirmation` is deliberately NOT expired — see isExpiredRequest. That status is only
 * ever set on purpose, and a manager's past booking request must stay answerable.
 *
 * Nobody is notified. An expiry is the absence of an action, not an action; telling the
 * manager "declined" would blame the artist for a decision nobody made.
 */
export async function sweepExpiredRequests(): Promise<void> {
  const store = useBookingStore.getState();
  const stale = store.bookings.filter((b) =>
    b.status === 'requested' &&
    isExpiredRequest(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime)
  );
  if (stale.length === 0) return;

  const now = new Date().toISOString();
  for (const b of stale) {
    // Local first so the UI settles immediately, then persist. Either side of the booking
    // can run this sweep; the write is idempotent, so both doing it is harmless.
    store.updateBookingStatus(b.id, 'expired', { updatedAt: now });
    await syncBookingStatus(b.id, 'expired', { updatedAt: now });
  }
}
