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
 * The calendar legend rows (the coloured status pills and the dot key beneath the
 * month grid). Hidden for now — they cost two full rows at the top of an already
 * dense screen. The dots stay; only the key is hidden.
 */
export const SHOW_CALENDAR_LEGEND = false;
