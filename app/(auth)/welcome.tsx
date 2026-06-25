import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { OAuthButtons } from '@/components/oauth-buttons';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { supabase } from '@/lib/supabase';

export default function WelcomeScreen() {
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    const value = email.trim().toLowerCase();
    if (!value) { Alert.alert('Enter your email', 'Please enter your email to continue.'); return; }
    // Minimal email shape check — the backend is the source of truth.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      // login_hint tells us which provider (if any) this email belongs to:
      //   'none'   → no account yet      → go pick a role and sign up
      //   'google' → Google OAuth acct   → tell them to use the Google button
      //   'apple'  → Apple OAuth acct    → tell them to use the Apple button
      //   else     → email/password acct → go to sign-in with email pre-filled
      const { data: hint } = await supabase.rpc('login_hint', { p_email: value });

      if (hint === 'none') {
        router.push(`/(auth)/choose-account-type?email=${encodeURIComponent(value)}` as Href);
      } else if (hint === 'google') {
        Alert.alert('Use Google to sign in', 'This account was created with Google. Tap “Continue with Google” below.');
      } else if (hint === 'apple') {
        Alert.alert('Use Apple to sign in', 'This account was created with Apple. Tap “Continue with Apple” below.');
      } else {
        router.push(`/(auth)/sign-in?email=${encodeURIComponent(value)}` as Href);
      }
    } catch {
      // RPC unavailable — fall back to the sign-in screen with the email pre-filled.
      router.push(`/(auth)/sign-in?email=${encodeURIComponent(value)}` as Href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2563EB' }]}>
      <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <Image
              source={require('@/assets/images/nexgig-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Login or Sign Up</Text>
          </View>

          {/* Email entry */}
          <View style={styles.actionsSection}>
            <TextInput
              style={styles.emailInput}
              placeholder="Enter your email"
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleContinue}
              editable={!busy}
            />

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
              onPress={handleContinue}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Please wait…' : 'Continue'}</Text>
            </Pressable>

            <OAuthButtons variant="onDark" />
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 32,
    paddingTop: 64,
    gap: 28,
  },
  logoSection: {
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 20,
  },
  tagline: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionsSection: {
    gap: 14,
    alignItems: 'center',
  },
  emailInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
  },
});
