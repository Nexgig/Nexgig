import { View, Text, StyleSheet, ActivityIndicator } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';

/**
 * Shown while a downloaded update is being applied.
 *
 * Without it the app just restarts: the screen resets to the dashboard mid-navigation and
 * reads as a crash. This covers the app from the moment an update is known to be coming
 * until the reload, so the user can't start something that is about to be thrown away, and
 * the restart arrives already explained.
 *
 * Deliberately opaque and touch-blocking rather than a toast — the point is to stop
 * interaction, not to narrate it.
 */
export function UpdatingOverlay({ visible }: { visible: boolean }) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFillObject, styles.wrap, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.label, { color: colors.muted }]}>Updating…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 9999 },
  label: { fontSize: 14, fontWeight: '600' },
});
