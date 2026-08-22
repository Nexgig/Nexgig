import { Linking, Alert } from 'react-native';

/**
 * Open an external link (mailto:, tel:, https:, maps…) SAFELY.
 *
 * `Linking.openURL` rejects when the device can't handle the link — no mail app configured,
 * an odd/blocked scheme, etc. An uncaught rejection surfaces in Sentry as "Unable to open URL"
 * and the tap silently does nothing. This wraps it so the user gets a clear message instead.
 *
 * Use this for every user-triggered link open. (The store link in force-update-gate deliberately
 * swallows errors silently and stays on its own path.)
 */
export function openLink(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert('Unable to open', "This device can't open that link."),
  );
}
