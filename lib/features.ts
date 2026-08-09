/**
 * Feature flags.
 *
 * Flip a flag back to `true` to restore the feature — the code stays in place,
 * so nothing has to be rewritten.
 */

/**
 * The gig History section on the artist profile and on both artist-profile views.
 * Hidden for now. The `isHistoryHidden` privacy flag and its eye toggle are still
 * wired up underneath, so turning this back on restores everything as it was.
 */
export const SHOW_ARTIST_HISTORY = false;

/**
 * The "verified" seal shown next to an artist's name — on the artist's own profile, on both
 * artist-profile views (artist→artist and manager→artist), and in the manager's Artists
 * roster. Hidden for now (stage 1); may return in stage 2. The `hasCompletedBooking` signal
 * that drives it stays computed underneath, so flipping this back to `true` restores every
 * seal exactly as it was.
 */
export const SHOW_ARTIST_VERIFIED_BADGE = false;

/**
 * The calendar legend rows (the coloured status pills and the dot key beneath the
 * month grid). Hidden for now — they cost two full rows at the top of an already
 * dense screen. The dots stay; only the key is hidden.
 */
export const SHOW_CALENDAR_LEGEND = false;

/**
 * The **Artists** sub-tab of the artist-side Network — i.e. artists browsing other
 * artists. Hidden 17 Jul 2026, restored 19 Jul 2026: the artist Network carries both
 * Venues and Artists again.
 *
 * With this off the sub-tab bar disappears entirely (venues would be the only tab, so a
 * one-tab bar is noise), the header reads "Venues" instead of "Network", and
 * `artist-profile-view` becomes unreachable from the artist side — that list is its only
 * entry point. Does NOT affect the manager's Network, which always browses artists.
 */
export const SHOW_ARTIST_DIRECTORY = true;

/**
 * Artists applying to join a venue from their side (the `applications` table).
 * Hidden 17 Jul 2026: connections are manager-initiated only.
 *
 * Covers BOTH ends of that flow — the artist's Apply button and the manager's
 * Accept/Decline inbox + pending badge, which is fed solely by these applications and
 * would otherwise sit empty forever. Existing rows are untouched; nothing new is
 * written. Flip back on and both sides return.
 */
export const ALLOW_ARTIST_VENUE_APPLICATIONS = false;

/**
 * Dual-role accounts — one login holding BOTH a manager and an artist profile, with a
 * switcher on the profile screen.
 *
 * Off by default and shipped dark on purpose. This touches sign-in, so a bug locks people
 * out of their account entirely — and unlike a broken screen, a broken sign-in can't be
 * fixed by simply looking at it. With the flag off, sign-in behaves exactly as it always
 * has and no switcher is rendered, so the code can ship and be enabled deliberately.
 *
 * Self-booking is ALLOWED (a venue owner who also performs can put themselves on their own
 * set) and notifications are NOT filtered by role, so both sides' notifications appear in
 * both modes. Both were product decisions, not oversights.
 */
export const ALLOW_DUAL_ROLE = true;
