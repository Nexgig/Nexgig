import type { ComponentProps } from 'react';
import { MaterialIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export type Occasion = { key: string; label: string; icon: IconName };

/**
 * Occasions an artist can tag a private event with. The tag drives the icon shown on the
 * event's tile (calendar card, dashboard row, booking detail). Order here IS the chip order
 * on the Add Private Event screen — Club is first and the default selection.
 *
 * Labels are kept short on purpose so the chips pack into two rows at phone width.
 */
export const OCCASIONS: Occasion[] = [
  { key: 'club',      label: 'Club',      icon: 'local-bar' },
  { key: 'party',     label: 'Party',     icon: 'celebration' },
  { key: 'wedding',   label: 'Wedding',   icon: 'favorite' },
  { key: 'birthday',  label: 'Birthday',  icon: 'cake' },
  { key: 'corporate', label: 'Corporate', icon: 'business' },
  { key: 'brunch',    label: 'Brunch',    icon: 'brunch-dining' },
  { key: 'sunset',    label: 'Sunset',    icon: 'wb-twilight' },
  { key: 'dinner',    label: 'Dinner',    icon: 'restaurant' },
];

// The chip pre-selected on a NEW private event.
export const DEFAULT_OCCASION = 'club';

// Single icon shown on EVERY private event tile (calendar card, dashboard row, booking detail).
// Occasions were removed from the Add Private Event screen — one mark for all private events now.
export const PRIVATE_EVENT_ICON = 'celebration' as const;

const BY_KEY: Record<string, Occasion> = Object.fromEntries(OCCASIONS.map((o) => [o.key, o]));

/**
 * Icon for a stored occasion key. Private events created before this feature have no occasion,
 * so they fall back to the DEFAULT occasion's icon (Club / martini glass) — same as a brand-new
 * event before the artist changes the chip.
 */
export function occasionIcon(occasion?: string | null): IconName {
  return (occasion && BY_KEY[occasion]?.icon) || BY_KEY[DEFAULT_OCCASION].icon;
}

export function occasionLabel(occasion?: string | null): string {
  return (occasion && BY_KEY[occasion]?.label) || 'Private Event';
}
