import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
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
 * How long the app must have been backgrounded before a restart is allowed.
 *
 * The restart is instant but DOES discard anything typed and not yet saved, since form text
 * lives in component state rather than in a persisted store. The gap is the proxy for "they
 * aren't mid-task".
 *
 * There is deliberately NO screen check on top of this: updates go out late at night when
 * nobody is mid-form, so the gap alone is enough for now. If usage grows into the evening,
 * the thing to add back is a guard skipping the reload on the form screens (create-venue,
 * edit-venue, edit-profile, add-slot, add-block, assign-artist, send-feedback, and
 * booking-detail with its review form) — a manager who steps out to Google Maps for an
 * address and returns six minutes later is the case that gap alone does not cover.
 */
// TEMPORARY: 30s while testing the mechanism. Back to 5 * 60 * 1000 once confirmed.
const MIN_BACKGROUND_MS = 30 * 1000;

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
        reportError(e, { where: 'useSilentUpdates' });
      } finally {
        checking.current = false;
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return updating;
}
