import type { ImageSourcePropType } from 'react-native';
import type { VenueType } from './types';

/**
 * Venue images are derived from the venue TYPE — there is no photo upload and no
 * per-venue avatar id. Pick a type, get the picture.
 *
 * Static require() map: Metro needs literal requires, so they're listed explicitly
 * (same as lib/avatars.ts).
 *
 * The artwork is a bold, centred mark on a flat, edge-to-edge background, because
 * the same square file is masked into three different shapes — a full-width x 180
 * banner (crops top/bottom), a 44px squircle, and a 48px circle (crops corners).
 */
export const VENUE_TYPE_IMAGES: Record<VenueType, ImageSourcePropType> = {
  'Beach Club':       require('@/assets/images/venues/beach-club.png'),
  'Cocktail Bar':     require('@/assets/images/venues/cocktail-bar.png'),
  'Dance Club':       require('@/assets/images/venues/dance-club.png'),
  'Live Music Venue': require('@/assets/images/venues/live-music-venue.png'),
  'Lounge':           require('@/assets/images/venues/lounge.png'),
  'Rooftop':          require('@/assets/images/venues/rooftop.png'),
};

/** Every venue has a type, so this always resolves. Falls back to Lounge only if a
 *  row somehow carries a type outside the union (bad data). */
export function venueImage(venueType?: VenueType | string | null): ImageSourcePropType {
  const key = (venueType ?? '') as VenueType;
  return VENUE_TYPE_IMAGES[key] ?? VENUE_TYPE_IMAGES['Lounge'];
}

/** For bookings: the venue row may be unreadable (artist disconnected, venue hidden),
 *  so bookings snapshot `venueType` and we resolve the image from that instead. */
export function venueImageFor(
  venue?: { venueType?: VenueType | string } | null,
  snapshotType?: VenueType | string | null,
): ImageSourcePropType {
  return venueImage(venue?.venueType ?? snapshotType);
}
