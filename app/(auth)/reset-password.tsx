import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Image, useWindowDimensions } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validate-email';

/**
 * Password reset — three steps, no deep links.
 *
 *   1. email    → resetPasswordForEmail() mails a recovery code
 *   2. code     → verifyOtp({ type: 'recovery' }) exchanges it for a session
 *   3. password → updateUser({ password }) sets the new one
 *
 * Deliberately code-based rather than magic-link: the app's URL scheme is
 * generated from the bundle id at build time, and mail clients routinely rewrite
 * links, which makes deep-link recovery the flakiest path on mobile.
 *
 * The code's LENGTH is a Supabase project setting (6, 8, 10…), so we don't hardcode
 * it — the input takes any digit string and we only require a sane minimum. That
 * way the app can't silently drift out of sync with the dashboard.
 *
 * NOTE: requires the Supabase "Reset Password" email template to include
 * {{ .Token }}. A template with only the magic link sends users no code to type.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

  const [stage, setStage] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState(emailParam ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // ── 1. Send the code ──────────────────────────────────────────────────────
  const sendCode = async () => {
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    setError('');
    setBusy(true);

    const { error: sendError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase()
    );
    setBusy(false);

    // Supabase intentionally does NOT reveal whether an address is registered —
    // it returns success either way. We mirror that: never confirm or deny that
    // an account exists, or we'd hand out an email-enumeration oracle.
    if (sendError) {
      Alert.alert('Something went wrong', sendError.message);
      return;
    }
    setStage('code');
  };

  // ── 2. Verify the code ────────────────────────────────────────────────────
  const verifyCode = async () => {
    if (code.trim().length < 6) { setError('Enter the code from your email.'); return; }
    setError('');
    setBusy(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'recovery',
    });
    setBusy(false);

    if (verifyError) {
      setError('That code isn’t right, or it has expired.');
      return;
    }
    // verifyOtp leaves us with a live session — enough to change the password.
    setStage('password');
  };

  // ── 3. Set the new password ───────────────────────────────────────────────
  const savePassword = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setError('');
    setBusy(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Sign out so they come back through the normal sign-in path — that's what
    // hydrates the profile into the store and routes them to the right dashboard.
    await supabase.auth.signOut();
    Alert.alert('Password updated', 'Sign in with your new password.', [
      { text: 'OK', onPress: () => router.replace(`/(auth)/sign-in?email=${encodeURIComponent(email)}` as Href) },
    ]);
  };

  const copy = {
    email: {
      title: 'Reset your password',
      body: 'Enter your email and we’ll send you a code.',
      cta: busy ? 'Sending…' : 'Send code',
      onPress: sendCode,
    },
    code: {
      title: 'Check your email',
      body: `We sent a code to ${email}. It expires shortly.`,
      cta: busy ? 'Checking…' : 'Verify code',
      onPress: verifyCode,
    },
    password: {
      title: 'Choose a new password',
      body: 'At least 6 characters.',
      cta: busy ? 'Saving…' : 'Save password',
      onPress: savePassword,
    },
  }[stage];

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F6F2EC' }]}>
      <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <Pressable
          onPress={() => (stage === 'email' ? router.back() : setStage(stage === 'password' ? 'code' : 'email'))}
          style={styles.backBtn}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000000" />
        </Pressable>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: height * 0.16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <Image source={require('@/assets/images/nexgig-logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline} numberOfLines={1}>{copy.title}</Text>
          </View>

          <View style={styles.actionsSection}>
            <Text style={styles.body}>{copy.body}</Text>

            {stage === 'email' && (
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#8E8E93"
                value={email}
                onChangeText={(v) => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={sendCode}
                autoFocus
              />
            )}

            {stage === 'code' && (
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="Enter code"
                placeholderTextColor="#8E8E93"
                value={code}
                onChangeText={(v) => { setCode(v.replace(/[^0-9]/g, '').slice(0, 10)); setError(''); }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={10}
                returnKeyType="done"
                onSubmitEditing={verifyCode}
                autoFocus
              />
            )}

            {stage === 'password' && (
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="New password"
                  placeholderTextColor="#8E8E93"
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(''); }}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={savePassword}
                  autoFocus
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                  <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#8E8E93" />
                </Pressable>
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
              onPress={copy.onPress}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{copy.cta}</Text>
            </Pressable>

            {stage === 'code' && (
              <Pressable onPress={sendCode} disabled={busy} hitSlop={8} style={styles.resendBtn}>
                <Text style={styles.resendText}>Didn’t get it? Send again</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { paddingHorizontal: 20, paddingVertical: 8, alignSelf: 'flex-start' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 180, height: 54 },
  tagline: { fontSize: 15, color: '#000000', marginTop: 8, fontWeight: '600' },
  actionsSection: { gap: 12 },
  body: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginBottom: 4, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: '#C6C6C8', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#000000',
  },
  codeInput: { textAlign: 'center', letterSpacing: 4, fontSize: 20, fontWeight: '700' },
  passwordContainer: { position: 'relative', justifyContent: 'center' },
  passwordInput: {
    borderWidth: 1, borderColor: '#C6C6C8', borderRadius: 14,
    paddingHorizontal: 16, paddingRight: 48, paddingVertical: 16, fontSize: 16, color: '#000000',
  },
  eyeBtn: { position: 'absolute', right: 14 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginTop: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  resendBtn: { alignItems: 'center', paddingVertical: 10 },
  resendText: { fontSize: 14, color: '#8E8E93', fontWeight: '600' },
});
