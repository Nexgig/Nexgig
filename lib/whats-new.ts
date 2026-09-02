import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ── EDIT THIS when you ship a user-facing feature ──────────────────────────────────────
 *
 * The "What's New" card shows ONCE per `version`. To announce something: bump `version` by 1
 * and rewrite `items` to describe what changed. The card then pops for every user the next time
 * they open the app after the OTA, and never again (until the next bump).
 *
 * DO NOT bump this for silent fixes / invisible OTAs — that turns the card into noise. Only bump
 * it when there's genuinely something to tell users.
 */
export const RELEASE_NOTES = {
  version: 1,
  items: [
    "Say hello to What's New — we'll pop a note here whenever we ship something.",
    'Got a feature idea? Send it from Settings → Send Feedback (pick "Feature Request"). We read every one.',
  ],
};

const STORAGE_KEY = 'nexgig:whatsNewSeenVersion';

/**
 * Returns { show, dismiss } for the What's New card. `enabled` gates it to signed-in users (so it
 * never pops on the welcome/auth screens). It compares the stored "seen" version to the current
 * RELEASE_NOTES.version; dismiss records the current version so it won't show again.
 */
export function useWhatsNew(enabled: boolean) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        const seen = v ? parseInt(v, 10) || 0 : 0;
        if (alive && seen < RELEASE_NOTES.version) setShow(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  const dismiss = () => {
    setShow(false);
    AsyncStorage.setItem(STORAGE_KEY, String(RELEASE_NOTES.version)).catch(() => {});
  };

  return { show, dismiss };
}
