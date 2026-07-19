import { View, Text, StyleSheet } from '@/lib/rn';

/**
 * The month header in a booking list ("June", or "January 2027" out of year).
 *
 * Only shown when the VISIBLE list spans more than one month — the DateBadge next to
 * each row gives weekday + day but no month, so without this a 15 Jun gig and a 15 Jul
 * gig look identical. When everything is in one month the header is pure noise, so the
 * caller omits it. Shared by both dashboards so they read the same.
 */
export function MonthSeparator({ label, color, borderColor, rule = false, center = false }: {
  label: string; color: string; borderColor: string; rule?: boolean; center?: boolean;
}) {
  return (
    <View style={[styles.wrap, center && styles.wrapCenter]}>
      {rule ? <View style={[styles.rule, { backgroundColor: borderColor }]} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
      {rule ? <View style={[styles.rule, { backgroundColor: borderColor }]} /> : null}
    </View>
  );
}

/** Same header under a different name, for non-month groupings (e.g. the manager's
 *  network tab splitting My Venues / Discover). Aliased rather than duplicated so the
 *  two never drift apart. Those lists take the defaults: no rule (their rows already
 *  carry dividers, so a rule read as a second line) and left-aligned. */
export const SectionSeparator = MonthSeparator;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 6 },
  wrapCenter: { justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
