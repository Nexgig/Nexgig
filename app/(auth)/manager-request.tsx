import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { submitManagerRequest } from '@/lib/manager-access';

// Managers are invite-only. When someone tries to sign up as a manager with an email that isn't
// approved, manager-register sends them here (name + email carried over) to REQUEST access. We
// record it + email admin@nexgigapp.com; nothing is created until we add their email to the
// allow-list in Supabase.
export default function ManagerRequestScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  // name / email / phone are carried over from step 1 of the signup — we don't re-ask for them.
  const { name, email, phone } = useLocalSearchParams<{ name?: string; email?: string; phone?: string }>();

  const [venues, setVenues] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const goHome = () => router.replace('/(auth)/welcome' as Href);

  const submit = async () => {
    if (sending) return;
    if (!venues.trim()) { Alert.alert('Required', 'Please tell us which venues or events you manage.'); return; }
    setSending(true);
    const ok = await submitManagerRequest({ name, email: email ?? '', phone, venues });
    setSending(false);
    if (!ok) {
      Alert.alert('Could not send', "We couldn't send your request just now. Please check your connection and try again.");
      return;
    }
    setSent(true);
  };

  // ── Confirmation ──
  if (sent) {
    return (
      <ScreenContainer>
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: colors.primary + '18' }]}>
            <MaterialIcons name="mark-email-read" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>Request received</Text>
          <Text style={[styles.doneBody, { color: colors.muted }]}>
            Thanks{name ? `, ${String(name).split(' ')[0]}` : ''}. We&apos;ll review your request and email you at{' '}
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>{email || 'your address'}</Text> once your manager account is approved.
          </Text>
          <Pressable style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]} onPress={goHome}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : goHome())} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]} hitSlop={8}>
        <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
      </Pressable>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: keyboardHeight + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground }]}>Request manager access</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Manager accounts are approved by the Nexgig team. Send us a few details and we&apos;ll get back to you.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.muted }]}>Email</Text>
          <View style={[styles.readonly, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.readonlyText, { color: colors.foreground }]} numberOfLines={1}>{email || '—'}</Text>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.muted }]}>Which venues or events do you manage?</Text>
          <TextInput
            style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.foreground }]}
            placeholder="Venue names, event series, etc." placeholderTextColor={colors.muted}
            value={venues} onChangeText={setVenues}
            multiline returnKeyType="done"
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed || sending ? 0.85 : 1 }]}
          onPress={submit} disabled={sending}
        >
          <Text style={styles.primaryBtnText}>{sending ? 'Sending…' : 'Send request'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backBtn: { alignSelf: 'flex-start', padding: 4, marginLeft: 20, marginTop: 8 },
  scroll: { paddingHorizontal: 24, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 28 },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  readonly: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  readonlyText: { fontSize: 15 },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 4 },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
  doneBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
});
