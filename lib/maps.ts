import { Alert } from 'react-native';
import { openLink } from './open-link';

/**
 * Ask the user whether to open a location in Google Maps or Waze, then open it there.
 *
 * Pass whatever you have: exact `lat`/`lng` win (real navigation pin); otherwise a free-text
 * `query` (venue address, venue name, or a private-event location) is geocoded by the app that
 * opens. `title` is shown as the dialog subtitle. Both links use the app's universal-link form so
 * they open the installed app when present and fall back to the web otherwise. `openLink` handles
 * the "no such app / can't open" case with a clear message.
 */
export function openMapsChooser(dest: { lat?: number | null; lng?: number | null; query?: string | null; title?: string | null }) {
  const hasCoords = dest.lat != null && dest.lng != null;
  const query = (dest.query ?? '').trim();
  if (!hasCoords && !query) {
    Alert.alert('No location', 'There is no location set for this.');
    return;
  }

  const googleUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  const wazeUrl = hasCoords
    ? `https://www.waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`
    : `https://www.waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;

  Alert.alert(
    'Open location',
    dest.title ? String(dest.title) : undefined,
    [
      { text: 'Google Maps', onPress: () => openLink(googleUrl) },
      { text: 'Waze', onPress: () => openLink(wazeUrl) },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}
