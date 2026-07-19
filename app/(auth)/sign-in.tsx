import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image } from '@/lib/rn';
import { useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { signIn as supabaseSignIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { hydrateRole } from '@/lib/roles';
import { ALLOW_DUAL_ROLE } from '@/lib/features';

export default function SignInScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();

  // Email is passed from the welcome screen's email step (read-only here).
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email] = useState(emailParam ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim()) { Alert.alert('Error', 'Please enter your email'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Please enter your password'); return; }

    setIsLoading(true);
    try {
      const data = await supabaseSignIn(email.trim().toLowerCase(), password);
      if (data.user && data.session) {

        // Which side to land on. With ALLOW_DUAL_ROLE off this is the historical
        // behaviour exactly: try manager, then artist. With it on, an account holding
        // BOTH profiles lands on the role stamped at signup rather than always manager,
        // and the switcher moves them from there.
        const stamped = (data.user.user_metadata as { account_type?: string } | null)?.account_type;
        const order: ('manager' | 'artist')[] =
          ALLOW_DUAL_ROLE && stamped === 'artist' ? ['artist', 'manager'] : ['manager', 'artist'];

        for (const role of order) {
          if (await hydrateRole(role, data.user)) {
            router.replace((role === 'manager'
              ? '/(manager)/(tabs)/dashboard'
              : '/(artist)/(tabs)/dashboard') as Href);
            return;
          }
        }

        // ── Authenticated, but no profile row ──────────────────────────────
        // They signed up and abandoned setup before the profile was written. The
        // account exists, so registering again would fail with "already
        // registered" — and there's nothing to sign in to. Resume their setup
        // instead of dead-ending them.
        //
        // `account_type` is stamped on the auth user at signup, so we know which
        // flow to send them back to. If it's missing (an older account, created
        // before we stamped it), let them pick again.
        const pendingType = (data.user.user_metadata as { account_type?: string } | null)?.account_type;

        Alert.alert(
          'Finish setting up your account',
          'You started signing up but never finished. Let’s pick up where you left off.',
          [{
            text: 'Continue',
            onPress: () => {
              // resume=1 tells the setup screen a session already exists, so it
              // skips signUp (which would fail with "already registered") and
              // hides the email/password fields.
              if (pendingType === 'manager') {
                router.replace('/(auth)/manager-register?resume=1' as Href);
              } else if (pendingType === 'artist') {
                router.replace('/(auth)/artist-setup?resume=1' as Href);
              } else {
                router.replace('/(auth)/choose-account-type?resume=1' as Href);
              }
            },
          }]
        );
      }
    } catch (error: any) {
      const msg = (error?.message ?? '').toLowerCase();
      const isBadCreds = msg.includes('invalid login credentials') || msg.includes('invalid credentials');
      if (isBadCreds) {
        // Could be a wrong password OR an account that was created via Google/Apple
        // (which has no password). Ask the backend which provider this email uses.
        try {
          const { data: hint } = await supabase.rpc('login_hint', { p_email: email.trim().toLowerCase() });
          if (hint === 'google') {
            Alert.alert('Use Google to sign in', 'This account was created with Google. Tap “Continue with Google” below to sign in.');
            return;
          }
          if (hint === 'apple') {
            Alert.alert('Use Apple to sign in', 'This account was created with Apple. Tap “Continue with Apple” below to sign in.');
            return;
          }
        } catch {
          // hint lookup unavailable — fall through to the generic message
        }
        Alert.alert('Sign In Failed', 'Incorrect email or password.');
        return;
      }
      Alert.alert('Sign In Failed', error.message ?? 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F6F2EC' }]}>
      <ScreenContainer containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#000000" />
        </Pressable>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: height * 0.16 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Logo + (slogan slot -> email) */}
          <View style={styles.logoSection}>
            <Image
              source={require('@/assets/images/nexgig-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline} numberOfLines={1}>{email || 'Book. Play. Discover.'}</Text>
          </View>

          {/* (email input slot -> password input) + (Continue -> Sign In) */}
          <View style={styles.actionsSection}>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#8E8E93"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                autoFocus
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#8E8E93" />
              </Pressable>
            </View>

            <Pressable
              onPress={() => router.push(`/(auth)/reset-password?email=${encodeURIComponent(email)}` as Href)}
              hitSlop={8}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, (pressed || isLoading) && { opacity: 0.85 }]}
              onPress={handleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.primaryBtnText}>{isLoading ? 'Signing in…' : 'Sign In'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 40, gap: 28 },
  backBtn: { position: 'absolute', top: 8, left: 20, zIndex: 10, padding: 4 },
  logoSection: { alignItems: 'center', gap: 2 },
  logo: { width: 235, height: 72 },
  tagline: { fontSize: 14, color: '#8E8E93', fontWeight: '600', textAlign: 'center' },
  actionsSection: { gap: 14, alignItems: 'center' },
  emailLabel: { fontSize: 14, color: '#8E8E93', fontWeight: '600', alignSelf: 'center' },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C6C6C8', borderRadius: 14, paddingHorizontal: 16,
  },
  passwordInput: { flex: 1, paddingVertical: 16, fontSize: 15, color: '#000000', letterSpacing: 0 },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: 'center', paddingVertical: 2 },
  forgotText: { fontSize: 14, color: '#8E8E93', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});