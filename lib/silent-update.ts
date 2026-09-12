import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { usePathname } from 'expo-router';
import { reportError } from './observability';

/**
 * Silent OTA adoption.
 *
 * The problem this solves: expo-updates only checks on a COLD START, and it applies what it
 * downloads on the NEXT one — so a user has to fully quit the app twice before they see an
 * update. Backgrounding is not quitting; iOS keeps the app suspended and no check happens.
 * A user who never swipes the app away can sit on a months-old bundle indefinitely.
 *
 * What this adds: on returning to the foreground after a real break, check for an update,
 * download it, and restart onto it. The restart is a splash flash — from the user's side,
 * indistinguishable from opening the app normally after being away.
 */

/**
 * How long the app must have been backgrounded before a foreground update+restart is allowed.
 *
 * Short (10s) so a genuine "closed it and came back" adopts the latest bundle almost
 * immediately, while iOS's momentary *inactive* blips — the app switcher, Control Center, a
 * permission / Face ID sheet, the notification shade — are ignored, so a reload never fires
 * out from under a two-second glance.
 *
 * The restart still discards anything typed and not yet saved (form text lives in component
 * state), so `onFormScreen()` ALSO skips the reload while the user is on a data-entry screen —
 * the update just waits for a later foreground when they're off it. (Changed from 5 min +
 * no screen check on 11 Sep 2026, so updates reach testers/users without the long wait.)
 */
const MIN_BACKGROUND_MS = 10 * 1000;

/**
 * How long "Updating…" stays up before the reload.
 *
 * Applying an already-downloaded update is near-instant, so without a floor the overlay
 * flashes for a frame and the restart still looks like a glitch. This is long enough to
 * read, short enough not to feel like waiting.
 */
const MIN_OVERLAY_MS = 700;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Data-entry screens whose unsaved input a restart would discard — skip the foreground
 * update+restart while the user is on one; it applies on a later foreground instead.
 * Matched on the route's last path segment. Add any NEW form screen here.
 */
const FORM_SCREENS = [
  'create-venue', 'edit-venue', 'edit-profile', 'billing-details', 'edit-budget',
  'add-slot', 'add-block', 'assign-artist', 'send-feedback', 'invoice-gigs', 'invoice-preview', 'booking-detail',
];
function onFormScreen(path: string | null): boolean {
  if (!path) return false;
  const seg = path.split('?')[0].split('/').filter(Boolean).pop() || '';
  return FORM_SCREENS.indexOf(seg) !== -1;
}

/**
 * Mount once, at the root. Returns whether an update is being applied — render
 * <UpdatingOverlay visible={...} /> on it, or the restart reads as a crash.
 */
export function useSilentUpdates(): boolean {
  /**
   * True when an update has been downloaded and is waiting to run.
   *
   * This is the cold-start leftover. Launching the app fully (rather than returning to it)
   * makes expo-updates download the new bundle in the background and keep running the old
   * one — so the update is already on the phone. Asking the SERVER "is anything newer?" can
   * then answer no, because there isn't: the newest version is already downloaded, just not
   * running. Reloading on this flag catches that case; the server check below is only for
   * updates published while the app sat in the background.
   */
  const { isUpdatePending } = useUpdates();
  // Read the live value inside the listener without re-subscribing when it flips.
  const pendingRef = useRef(isUpdatePending);
  pendingRef.current = isUpdatePending;

  // Current route, read inside the listener via a ref (no re-subscribe) so we can skip the
  // restart while the user is on a form screen.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const backgroundedAt = useRef<number | null>(null);
  // Guards against overlapping checks if the app is foregrounded twice in quick succession.
  const checking = useRef(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // In development the JS is served by Metro, not by expo-updates — checking would throw.
    if (__DEV__ || !Updates.isEnabled) return;

    const onChange = async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        // Only record the FIRST transition away: iOS fires 'inactive' for transient things
        // like the app switcher or a permission sheet, and overwriting here would reset the
        // clock on a user who has genuinely been gone for an hour.
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;

      const away = backgroundedAt.current === null ? 0 : Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (away < MIN_BACKGROUND_MS || checking.current) return;
      // Never reload out from under someone typing into a form — wait for a later foreground.
      if (onFormScreen(pathRef.current)) return;

      checking.current = true;
      try {
        // Already downloaded (see isUpdatePending above) — just run it.
        if (pendingRef.current) {
          setUpdating(true);
          await delay(MIN_OVERLAY_MS);
          await Updates.reloadAsync();
          return;
        }
        // The check runs WITHOUT the overlay: it is quick and usually finds nothing, so
        // showing it here would flash "Updating…" on every single foreground.
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        // From here an update is definitely coming, so cover the app: the download takes a
        // second or two, and that is exactly the window in which the user starts tapping
        // into a screen the restart is about to discard.
        setUpdating(true);
        const [, ] = await Promise.all([Updates.fetchUpdateAsync(), delay(MIN_OVERLAY_MS)]);
        await Updates.reloadAsync();
      } catch (e) {
        // Offline, or the update server is unreachable. Not worth surfacing to the user —
        // they keep running the bundle they have, which is exactly the old behaviour.
        // Drop the overlay: reloadAsync never happened, so nothing is going to replace it.
        setUpdating(false);
        // A dropped connection / timeout on the update check is EXPECTED (the comment above),
        // so don't report it — it's just Sentry noise. Only surface genuinely unexpected failures.
        // "Failed to load all assets" / "Failed to download …" are expo-updates' own wording for the
        // SAME thing — the connection dropped part-way through downloading the update's assets — so
        // they're silenced too (the app just keeps its current bundle and retries next foreground).
        const msg = e instanceof Error ? e.message : String(e);
        if (!/tim(?:e|ed)\s?out|timeout|network|offline|unreachable|connection|internet|Unable to (?:connect|resolve)|Failed to load all assets|Failed to download/i.test(msg)) {
          reportError(e, { where: 'useSilentUpdates' });
        }
      } finally {
        checking.current = false;
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return updating;
}
