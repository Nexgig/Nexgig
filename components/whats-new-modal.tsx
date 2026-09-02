import { View, Text, Pressable, StyleSheet, Modal } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';

/**
 * "What's New" card — shown once after an update that bumped RELEASE_NOTES.version. A branded
 * card (not a full-screen takeover) with the role's changelog + a "Got it" / "Send feedback" row.
 */
export function WhatsNewModal({
  visible,
  onDismiss,
  onSendFeedback,
  items,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSendFeedback: () => void;
  items: string[];
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <MaterialIcons name="celebration" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>What&apos;s New</Text>
          <View style={styles.items}>
            {items.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.itemText, { color: colors.foreground }]}>{it}</Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onSendFeedback}
              style={({ pressed }) => [styles.btnSecondary, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Send feedback</Text>
            </Pressable>
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.btnPrimaryText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontFamily: fonts.displayBold, letterSpacing: -0.4, marginBottom: 14 },
  items: { alignSelf: 'stretch', gap: 12, marginBottom: 22 },
  itemRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  itemText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btnSecondary: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '600' },
  btnPrimary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
