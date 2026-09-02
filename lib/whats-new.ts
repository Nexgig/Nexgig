import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'artist' | 'manager';

/**
 * ── EDIT THIS when you ship a user-facing feature ──────────────────────────────────────
 *
 * The "What's New" card shows ONCE per `version`, PER ROLE. To announce something: bump
 * `version` by 1 and rewrite the note lists. A user sees `both` + their own role's list; if a
 * version has nothing for their role (empty `both` AND empty role list), they get no card at all.
 *
 * DO NOT bump this for silent fixes / invisible OTAs — that turns the card into noise. Only bump
 * it when there's genuinely something to tell users.
 */
export const RELEASE_NOTES = {
  version: 3,
  // Shown to everyone:
  both: [
    "Say hello to What's New — we'll pop a note here whenever we ship something.",
    'Got a feature idea? Tap "Send feedback" below — it goes straight to us, and we read every one.',
  ] as string[],
  // Shown only to artists:
  artist: [
    'Your Venues tab is simpler: tap a venue to jump straight to invoicing, and "View Profile" to open the venue.',
  ] as string[],
  // Shown only to managers:
  manager: [
    'Assigning artists is clearer: one slot can hold several artists, and the buttons now read "Send Request(s)" and "Save as Draft".',
  ] as string[],
};

/** The notes a given role should see: the shared ones plus that role's own. */
export function notesFor(role: Role | undefined): string[] {
  const roleNotes = role === 'manager' ? RELEASE_NOTES.manager : role === 'artist' ? RELEASE_NOTES.artist : [];
  return [...RELEASE_NOTES.both, ...roleNotes];
}

const keyFor = (role: Role) => `nexgig:whatsNewSeenVersion:${role}`;

/**
 * Mark the current release as already seen for a role, WITHOUT showing the card. Call this the
 * moment a brand-new account finishes signup, so a new user doesn't get a "What's New" on their
 * very first sign-in (everything is new to them) — they only start seeing cards from the NEXT
 * update onward. Returning users who log in never hit this, so they still see the card.
 */
export async function markWhatsNewSeen(role: Role) {
  try { await AsyncStorage.setItem(keyFor(role), String(RELEASE_NOTES.version)); } catch {}
}

/**
 * Returns { show, dismiss, items } for the What's New card. `enabled` gates it to signed-in users;
 * `role` picks the note set + the per-role "seen" marker. It shows when this role has notes this
 * version and hasn't seen it yet; dismiss records the current version for that role.
 */
export function useWhatsNew(enabled: boolean, role: Role | undefined) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled || !role) return;
    let alive = true;
    const hasNotes = notesFor(role).length > 0;
    AsyncStorage.getItem(keyFor(role))
      .then((v) => {
        const seen = v ? parseInt(v, 10) || 0 : 0;
        if (alive && hasNotes && seen < RELEASE_NOTES.version) setShow(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled, role]);

  const dismiss = () => {
    setShow(false);
    if (role) AsyncStorage.setItem(keyFor(role), String(RELEASE_NOTES.version)).catch(() => {});
  };

  return { show, dismiss, items: role ? notesFor(role) : [] };
}
