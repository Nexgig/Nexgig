import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal } from '@/lib/rn';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';

/**
 * Signup email-confirmation step. With Supabase "Confirm email" ON, signUp creates the
 * account but no session — the user must enter the 6-digit code we emailed. verifyOtp
 * ({ type: 'signup' }) confirms the address AND establishes the session, after which the
 * caller continues its signup wizard. Used by the artist + manager email signups.
 */
export function EmailOtpModal({
  visible,
  email,
  onVerified,
  onCancel,
}: {
  visible: boolean;
  email: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async () => {
    const token = code.trim();
    if (token.length < 6) { setError('Enter the 6-digit code from your email.'); return; }
    setLoading(true); setError(''); setResent(false);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
      if (err) { setError(err.message || 'That code is invalid or expired.'); return; }
      setCode('');
      onVerified();
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading) return;
    setError(''); setResent(false);
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email });
      if (err) { setError(err.message || 'Could not resend — try again in a minute.'); return; }
      setResent(true);
    } catch {
      setError('Could not resend — try again in a minute.');
    }
  };

  const close = () => { setCode(''); setError(''); setResent(false); onCancel(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Verify your email</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            Enter the 6-digit code we just emailed to{'\n'}<Text style={{ color: colors.foreground }}>{email}</Text>
          </Text>

          <TextInput
            style={[styles.input, { borderColor: error ? colors.error : colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
            value={code}
            onChangeText={(t) => { setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
            placeholder="123456"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textAlign="center"
          />

          {!!error && <Text style={[styles.msg, { color: colors.error }]}>{error}</Text>}
          {resent && !error ? <Text style={[styles.msg, { color: colors.success }]}>New code sent.</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.verifyBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 }]}
            onPress={verify}
            disabled={loading}
          >
            <Text style={styles.verifyText}>{loading ? 'Verifying…' : 'Verify'}</Text>
          </Pressable>

          <View style={styles.linksRow}>
            <Pressable onPress={resend} hitSlop={8} disabled={loading}><Text style={[styles.link, { color: loading ? colors.muted : colors.primary }]}>Resend code</Text></Pressable>
            <Text style={{ color: colors.border }}>·</Text>
            <Pressable onPress={close} hitSlop={8} disabled={loading}><Text style={[styles.link, { color: colors.muted, opacity: loading ? 0.5 : 1 }]}>Cancel</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 24 },
  title: { fontSize: 20, fontFamily: fonts.bodyBold, letterSpacing: -0.3, marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  input: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, fontSize: 24, letterSpacing: 8, fontFamily: fonts.bodyBold },
  msg: { fontSize: 13, marginTop: 10 },
  verifyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  verifyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  link: { fontSize: 14, fontWeight: '600' },
});
