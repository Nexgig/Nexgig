import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { deleteAccount } from '@/lib/delete-account';
import { rolesAvailable, reloadIntoRole } from '@/lib/roles';
import { useAuthStore } from '@/lib/store';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  accountType: 'manager' | 'artist';
}

export function DeleteAccountModal({ visible, onClose, accountType }: DeleteAccountModalProps) {
  const colors = useColors();
  const router = useRouter();
  const email = useAuthStore((s) => s.currentUser?.email);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Does the OTHER role also exist? Decides whether this is a scoped delete (keep the other
  // profile + login) or a full one, which changes the warning and where the user lands.
  const [hasOther, setHasOther] = useState(false);
  const otherRole = accountType === 'manager' ? 'artist' : 'manager';

  useEffect(() => {
    if (!visible || !email) return;
    let cancelled = false;
    rolesAvailable(email).then((r) => { if (!cancelled) setHasOther(r[otherRole]); });
    return () => { cancelled = true; };
  }, [visible, email, otherRole]);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE' && !deleting;

  const thisRole = accountType === 'manager' ? 'manager' : 'artist';
  const warning = hasOther
    ? `This permanently deletes your ${thisRole} profile and its data. Your ${otherRole} account stays, and you'll switch to it. This cannot be undone.`
    : accountType === 'manager'
      ? 'This permanently deletes your account, profile, and personal data. Your venues will be deactivated and your name removed from past bookings. This cannot be undone.'
      : 'This permanently deletes your account, profile, availability, and personal data. Your name will be removed from past bookings. This cannot be undone.';

  const title = hasOther ? `Delete ${thisRole === 'manager' ? 'Manager' : 'Artist'} Profile` : 'Delete Account';

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    onClose();
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const result = await deleteAccount(thisRole);
      if (!result.fullyDeleted && result.remaining) {
        // Scoped delete: the other profile survives and is already re-hydrated. Drop into it
        // by reloading (same as a role switch) rather than a cross-group navigation.
        const remaining = result.remaining;
        await reloadIntoRole(() => router.replace((remaining === 'manager'
          ? '/(manager)/(tabs)/dashboard'
          : '/(artist)/(tabs)/dashboard') as Href));
      } else {
        // Whole account gone + signed out. Back to Welcome.
        router.replace('/(auth)/welcome' as Href);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setDeleting(false);
      Alert.alert('Could not delete account', msg);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: '#EF444418' }]}>
            <MaterialIcons name="warning-amber" size={28} color="#EF4444" />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{warning}</Text>

          <Text style={[styles.prompt, { color: colors.foreground }]}>
            Type <Text style={{ fontWeight: '800' }}>DELETE</Text> to confirm:
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
            returnKeyType="done"
          />

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={handleClose}
              disabled={deleting}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.deleteBtn, { backgroundColor: canDelete ? '#EF4444' : colors.border, opacity: pressed && canDelete ? 0.85 : 1 }]}
              onPress={handleDelete}
              disabled={!canDelete}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.deleteText, { color: canDelete ? '#fff' : colors.muted }]}>Delete</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 24, gap: 12, alignItems: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  prompt: { fontSize: 14, marginTop: 4, alignSelf: 'flex-start' },
  input: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  actions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
  deleteBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '700' },
});
