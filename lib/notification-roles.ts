import type { Role } from './roles';

/**
 * Which side of the app a notification belongs to.
 *
 * A dual-role account has ONE auth user id, so both roles' notifications share a userId and
 * filtering on that alone puts everything in both lists — an artist seeing "Invoice Received"
 * is nonsense. The type already identifies the side, with two exceptions that reused one slug
 * for opposite events; those were split rather than adding a `role` column, because
 * notifications are written by an Edge Function and a new column means redeploying it:
 *
 *   booking_cancelled       manager cancels  → artist
 *   booking_cancelled_by_artist  artist cancels → manager   (was also booking_cancelled)
 *   lineup_removed          manager removes  → artist
 *   artist_left_venue       artist leaves    → manager      (was also lineup_removed)
 *
 * Anything not listed shows in BOTH lists. That fallback is deliberate: an unmapped type is
 * more likely a slug someone added later than one that should be hidden, and showing a
 * notification twice is a far smaller failure than silently swallowing it.
 */
export const NOTIFICATION_ROLE: Record<string, Role> = {
  // ── The artist receives ──
  booking_request: 'artist',
  past_confirmation_request: 'artist',
  booking_cancelled: 'artist',
  booking_request_cancelled: 'artist',
  lineup_added: 'artist',
  lineup_removed: 'artist',
  lineup_declined: 'artist',
  lineup_invite: 'artist',
  venue_assigned: 'artist',
  venue_removed: 'artist',
  booking_completed: 'artist',

  // ── The manager receives ──
  booking_confirmed: 'manager',
  booking_declined: 'manager',
  booking_cancelled_by_artist: 'manager',
  artist_left_venue: 'manager',
  review_submitted: 'manager',
  invoice_received: 'manager',
  invoice_cancelled: 'manager',
  lineup_request: 'manager',
  lineup_accepted: 'manager',
  artist_joined: 'manager',
};

/** Should this notification appear while `role` is the active one? */
export function isForRole(type: string, role: Role): boolean {
  const owner = NOTIFICATION_ROLE[type];
  return !owner || owner === role;
}
