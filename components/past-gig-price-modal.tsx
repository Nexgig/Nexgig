import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from '@/lib/rn';
import { TextInput } from 'react-native';
import { useColors } from '@/hooks/use-colors';

/**
 * Small confirm sheet for sending a PAST-gig (completed) request, with a price field. Past gigs
 * don't stage (they send immediately), so a plain Alert can't collect a price — this replaces it.
 * Pre-fills from the slot default when there is one; the amount is optional.
 */
export function PastGigPriceModal({
  visible,
  artistName,
  subtitle,
  defaultPrice,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  artistName: string;
  subtitle: string;
  defaultPrice?: number;
  onCancel: () => void;
  onConfirm: (price: number | undefined) => void;
}) {
  const colors = useColors();
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (visible) setPrice(defaultPrice != null ? String(defaultPrice) : '');
  }, [visible, defaultPrice]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Confirm past gig</Text>
          <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={2}>{artistName} · {subtitle}</Text>

          <Text style={[styles.label, { color: colors.muted }]}>WHAT YOU PAID (AED)</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.currency, { color: colors.muted }]}>AED</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
              placeholder="Optional"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              autoFocus
              returnKeyType="done"
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.btnSecondary, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(price === '' ? undefined : parseInt(price, 10))}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.btnPrimaryText}>Send request</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 22 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  sub: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, marginBottom: 22 },
  currency: { fontSize: 13, fontWeight: '700' },
  input: { flex: 1, fontSize: 16, fontWeight: '700', paddingVertical: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  btnSecondary: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '600' },
  btnPrimary: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
