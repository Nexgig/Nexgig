import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'artist' | 'manager';

/**
 * ── First-run "Welcome to Nexgig" card ─────────────────────────────────────────────────
 *
 * Shows ONCE per `version`, PER ROLE — a warm orientation for a brand-new account. Unlike
 * What's New, we DON'T pre-mark this as seen at signup, so genuinely new users get it on their
 * first entry. Bumping `version` re-shows it to everyone (use that sparingly — e.g. a major
 * relaunch), which is also how you push it to existing testers to review.
 */
export const WELCOME: Record<Role, { title: string; intro: string; bullets: string[] }> = {
  artist: {
    title: 'Welcome to Nexgig',
    intro: "You're all set. Here's how to start getting booked:",
    bullets: [
      '🎧 Venues send you gig requests — accept or decline right from your dashboard, and see your fee up front.',
      "📅 Your calendar holds it all — every request and booking in one place. Block the nights you're busy so no one double-books you.",
      '🧾 Finished a gig? Turn it into an invoice in a tap, and watch your earnings add up month by month.',
      "✨ Add a profile photo and your genres so venues know exactly who they're booking.",
    ],
  },
  manager: {
    title: 'Welcome to Nexgig',
    intro: "You're all set. Here's how to book your first artist:",
    bullets: [
      "🏢 Add your venue — it's home to your schedule, roster, and bookings.",
      "🎤 Build your roster — add artists, or book a guest DJ who isn't on Nexgig yet.",
      '📅 Create sets on the calendar and send requests — set a default fee once and it follows every artist you book.',
      '💰 Stay on budget — track spend with Monthly Budget, and get invoices from your artists automatically.',
    ],
  },
};

const WELCOME_VERSION = 1;
const keyFor = (role: Role) => `nexgig:welcomeSeenVersion:${role}`;

/**
 * Returns { show, dismiss, content } for the Welcome card. `enabled` gates it to signed-in users;
 * `role` picks the copy + the per-role "seen" marker. Shows when this role hasn't seen the current
 * WELCOME_VERSION yet; dismiss records it so it never re-shows (until the version is bumped).
 */
export function useWelcome(enabled: boolean, role: Role | undefined) {
  const [show, setShow] = useState(false);
  // `resolved` = we've finished reading the "seen" flag and made a show/hide decision. What's New
  // waits on this so it never races the Welcome card into a second native popup at cold start.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!enabled || !role) { setResolved(true); return; }
    let alive = true;
    setResolved(false);
    AsyncStorage.getItem(keyFor(role))
      .then((v) => {
        const seen = v ? parseInt(v, 10) || 0 : 0;
        if (!alive) return;
        if (seen < WELCOME_VERSION) setShow(true);
        setResolved(true);
      })
      .catch(() => { if (alive) setResolved(true); });
    return () => { alive = false; };
  }, [enabled, role]);

  const dismiss = () => {
    setShow(false);
    if (role) AsyncStorage.setItem(keyFor(role), String(WELCOME_VERSION)).catch(() => {});
  };

  return { show, dismiss, resolved, content: role ? WELCOME[role] : null };
}
