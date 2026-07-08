// ─── Avatar round-preview confirm step ────────────────────────────────────
// After the native (square) crop, show the picked image inside a CIRCULAR
// frame so the user sees exactly how it'll appear as an avatar before it's
// applied — the Instagram pattern (square crop → round preview → confirm).
// Pure JS, no native deps → ships OTA.

import { Modal, View, Text, Pressable, Image, StyleSheet } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';

interface AvatarPreviewModalProps {
  /** Local uri of the freshly-cropped image. Modal is visible while this is non-null. */
  uri: string | null;
  /** User accepted the preview → apply the photo. */
  onConfirm: () => void;
  /** User wants to pick again → re-open the picker. */
  onRetry: () => void;
  /** User dismissed → discard the pending photo. */
  onCancel: () => void;
}

const PREVIEW = 200;

export function AvatarPreviewModal({ uri, onConfirm, onRetry, onCancel }: AvatarPreviewModalProps) {
  const colors = useColors();

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Preview</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>This is how your photo will appear.</Text>

          <View style={[styles.ring, { borderColor: colors.border }]}>
            {uri ? <Image source={{ uri }} style={styles.photo} resizeMode="cover" /> : null}
          </View>

          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>Use Photo</Text>
          </Pressable>

          <Pressable onPress={onRetry} style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Choose Another</Text>
          </Pressable>

          <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  ring: { width: PREVIEW, height: PREVIEW, borderRadius: PREVIEW / 2, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  photo: { width: '100%', height: '100%' },
  primaryBtn: { width: '100%', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { width: '100%', height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  cancelBtn: { width: '100%', height: 40, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 14 },
});
