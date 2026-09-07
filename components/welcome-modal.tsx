import { View, Text, Pressable, StyleSheet, Modal, ScrollView, useWindowDimensions } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';

/**
 * "Welcome to Nexgig" card — shown once to a brand-new account (per role). Same branded card
 * family as What's New: a coral-accented sheet with a title, a one-line intro, a short list of
 * what they can do, and a single "Let's go" button. Bounded + scrollable so the list can never
 * push the button off-screen.
 */
export function WelcomeModal({
  visible,
  onDismiss,
  title,
  intro,
  bullets,
}: {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  intro: string;
  bullets: string[];
}) {
  const colors = useColors();
  const { height: winH } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border, maxHeight: winH * 0.85 }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <Text style={styles.wave}>👋</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.intro, { color: colors.muted }]}>{intro}</Text>
          <ScrollView
            style={styles.items}
            contentContainerStyle={styles.itemsContent}
            showsVerticalScrollIndicator={false}
          >
            {bullets.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.itemText, { color: colors.foreground }]}>{it}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.btnPrimaryText}>Let&apos;s go</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  wave: { fontSize: 28 },
  title: { fontSize: 20, fontFamily: fonts.displayBold, letterSpacing: -0.4, marginBottom: 6 },
  intro: { fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  items: { alignSelf: 'stretch', flexShrink: 1, marginBottom: 22 },
  itemsContent: { gap: 14 },
  itemRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  itemText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  btnPrimary: { alignSelf: 'stretch', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
