import { supabase } from './supabase';
import { useBookingStore } from './store';
import { isExpiredRequest } from './utils';
import { reportWarning } from './observability';

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
    // A gig that was ever confirmed is NOT an unanswered request — never expire it, even if THIS
    // device's copy still reads 'requested' (a stale local snapshot from before the confirm synced).
    !b.confirmedAt &&
    isExpiredRequest(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime)
  );
  if (stale.length === 0) return;

  const now = new Date().toISOString();
  for (const b of stale) {
    // Write to the DB FIRST, GUARDED on the row still being 'requested' THERE. The local copy can be
    // stale — a confirmation that reached another device but not this one — and an unconditional write
    // keyed only on `id` would clobber a real confirmed/completed booking to 'expired' (exactly the bug
    // that wrongly expired a completed gig, 3 Sep 2026). `.eq('status','requested')` makes the write a
    // no-op once the source of truth has moved on; only a genuine flip is then reflected locally.
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'expired', updated_at: now })
      .eq('id', b.id)
      .eq('status', 'requested')
      .select('id');
    if (error) {
      reportWarning('expire write failed', { bookingId: b.id, error: error.message });
      continue;
    }
    if (!data || data.length === 0) continue; // DB already moved past 'requested' — don't clobber it
    store.updateBookingStatus(b.id, 'expired', { updatedAt: now });
  }
}
