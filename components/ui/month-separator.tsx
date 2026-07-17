import { View, Text, StyleSheet } from '@/lib/rn';

/**
 * The month header in a booking list ("June", or "January 2027" out of year).
 *
 * Only shown when the VISIBLE list spans more than one month — the DateBadge next to
 * each row gives weekday + day but no month, so without this a 15 Jun gig and a 15 Jul
 * gig look identical. When everything is in one month the header is pure noise, so the
 * caller omits it. Shared by both dashboards so they read the same.
 */
export function MonthSeparator({ label, color, borderColor }: { label: string; color: string; borderColor: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: borderColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
