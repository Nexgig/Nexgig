import { View, Text, StyleSheet } from '@/lib/rn';
import { fonts } from '@/lib/fonts';

/**
 * The booking status palette. Lives next to DateBadge because the badge is what most
 * of it colours. Import this rather than re-typing the hexes — they were duplicated
 * across the dashboards, the list screens and the artist calendar, which is how you
 * end up with two shades of "pending".
 */
export const STATUS_COLORS = {
  // Amber, deliberately in coral's family: coral is #E2674A, this is #E29A4A — same red,
  // same blue, only green moves. The old gold #D4A017 shared nothing with the brand and
  // read as bolted on. Amber (not coral) because pending means "waiting on you" and coral
  // is the ACTION colour — buttons, links, the Invoiced chip. Coral must mean one thing.
  pending: '#E29A4A',   // amber — requested / past_confirmation
  confirmed: '#22C55E', // green — also Private Event
  // Slate, not blue: completed is terminal and the most numerous status over time (History
  // only grows), so it should recede rather than shout. NOT #8E8E93 — that's the `muted`
  // token (theme.config.js), used for draft dots on the calendar and Draft/Removed pills;
  // reusing it would make a completed gig indistinguishable from a draft. This slate is
  // clearly cooler/darker than muted, so the two never collide.
  completed: '#64748B',
  cancelled: '#C4432F', // brick — also declined, and Block/Unavailable
} as const;

/**
 * The booking row's date tile — a rounded square filled with the booking's status
 * colour (gold pending / green confirmed / blue completed), showing the weekday short
 * (WED) over the day number. Shared by both dashboards, the confirmed/pending/completed
 * list pages, and the artist-bookings list, so they stay visually identical.
 */
export function DateBadge({ dateStr, color }: { dateStr?: string | null; color: string }) {
  if (!dateStr) return <View style={[styles.dateBadge, { backgroundColor: color }]} />;
  const d = new Date(dateStr + 'T00:00:00');
  const wk = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return (
    <View style={[styles.dateBadge, { backgroundColor: color }]}>
      <Text style={styles.dateBadgeShort}>{wk}</Text>
      <Text style={styles.dateBadgeNum}>{d.getDate()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateBadge: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateBadgeShort: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: '#fff', letterSpacing: 0.5 },
  dateBadgeNum: { fontSize: 18, fontFamily: fonts.bodySemibold, color: '#fff' },
});
