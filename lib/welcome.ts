import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'artist' | 'manager';

/**
 * ── First-run "Welcome to Nexgig" card ─────────────────────────────────────────────────
 *
 * A warm orientation shown ONCE to a BRAND-NEW account, per role — never to existing users.
 * The mechanism: `markWelcomePending(role)` is called the moment signup completes, which sets a
 * per-role flag; the card shows while that flag is set and clears it on dismiss. Existing users
 * never run the signup flow, so they never get the flag and never see the card. (To preview it
 * yourself, create a fresh test account — there's deliberately no "show to everyone" switch.)
 */
export const WELCOME: Record<Role, { title: string; intro: string; bullets: string[] }> = {
  artist: {
    title: 'Welcome to Nexgig',
    intro: "Here's how to start getting booked:",
    bullets: [
      'Venues send you gig requests — accept or decline right from your dashboard, and see your fee up front.',
      'Track your monthly earnings.',
      'Turn your gigs into an invoice in a tap, and watch your earnings add up.',
      'Create your own bookings to keep track of them.',
      "Add a profile photo and your genres so venues know exactly who they're booking.",
    ],
  },
  manager: {
    title: 'Welcome to Nexgig',
    intro: "Here's how to book your first artist:",
    bullets: [
      "Add your venue — it's home to your schedule, roster, and bookings.",
      "Build your roster — add artists to join you, or book guest DJ who isn't on Nexgig yet.",
      'Create sets on the calendar and send requests — set a default fee once and it follows every artist you book.',
      'Stay on budget — track spend with Monthly Budget, and get invoices from your artists automatically.',
    ],
  },
};

const pendingKey = (role: Role) => `nexgig:welcomePending:${role}`;

/**
 * Arm the Welcome card for a brand-new account. Call this the moment signup finishes (alongside
 * markWhatsNewSeen) — it sets the per-role flag that useWelcome looks for on next entry.
 */
export async function markWelcomePending(role: Role) {
  try { await AsyncStorage.setItem(pendingKey(role), '1'); } catch {}
}

/**
 * Returns { show, dismiss, resolved, content } for the Welcome card. `enabled` gates it to
 * signed-in users; `role` picks the copy. Shows only while the per-role "pending" flag is set
 * (armed at signup); dismiss clears it so it never shows again.
 */
export function useWelcome(enabled: boolean, role: Role | undefined) {
  const [show, setShow] = useState(false);
  // `resolved` = we've finished reading the flag and made a show/hide decision. What's New waits
  // on this so it never races the Welcome card open at cold start.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!enabled || !role) { setResolved(true); return; }
    let alive = true;
    setResolved(false);
    AsyncStorage.getItem(pendingKey(role))
      .then((v) => {
        if (!alive) return;
        if (v === '1') setShow(true);
        setResolved(true);
      })
      .catch(() => { if (alive) setResolved(true); });
    return () => { alive = false; };
  }, [enabled, role]);

  const dismiss = () => {
    setShow(false);
    if (role) AsyncStorage.removeItem(pendingKey(role)).catch(() => {});
  };

  return { show, dismiss, resolved, content: role ? WELCOME[role] : null };
}
