import { View, Text, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import AntDesign from '@expo/vector-icons/AntDesign';
import type { User } from '@supabase/supabase-js';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { signInWithApple, signInWithGoogle } from '@/lib/auth';

// Reusable Apple + Google sign-in buttons. Handles the full post-sign-in
// routing: existing managers/artists go straight to their home; brand-new
// OAuth users go to the account-type selection screen.
export function OAuthButtons({ variant = 'onLight' }: { variant?: 'onLight' | 'onDark' }) {
  const router = useRouter();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);

  const onDark = variant === 'onDark';

  const routeAfter = async (user: User, fullName?: string) => {
    const email = (user.email ?? '').toLowerCase();

    // Existing manager?
    const { data: managerProfile } = await supabase
      .from('managers').select('*').eq('email', email).maybeSingle();
    if (managerProfile) {
      await supabase.from('users').upsert({
        id: user.id,
        email: managerProfile.email,
        full_name: managerProfile.full_name,
        account_type: 'manager',
        phone: managerProfile.phone ?? '',
        is_phone_verified: false,
        is_email_verified: true,
      }, { onConflict: 'id' });
      setCurrentUser({
        id: user.id,
        email: managerProfile.email,
        phone: managerProfile.phone ?? '',
        accountType: 'manager',
        fullName: managerProfile.full_name,
        isPhoneVerified: false,
        isEmailVerified: true,
        createdAt: user.created_at,
        updatedAt: user.created_at,
      });
      router.replace('/(manager)/(tabs)/dashboard' as Href);
      return;
    }

    // Existing artist?
    const { data: artistProfile } = await supabase
      .from('artists').select('*').eq('email', email).maybeSingle();
    if (artistProfile) {
      setCurrentUser({
        id: user.id,
        email: artistProfile.email,
        phone: '',
        accountType: 'artist',
        fullName: artistProfile.full_name,
        isPhoneVerified: false,
        isEmailVerified: true,
        createdAt: user.created_at,
        updatedAt: user.created_at,
      });
      router.replace('/(artist)/(tabs)/home' as Href);
      return;
    }

    // Brand-new OAuth user → pick account type (name/email pre-filled).
    const params = new URLSearchParams();
    if (fullName) params.set('name', fullName);
    if (email) params.set('email', email);
    router.replace(`/(auth)/choose-account-type?${params.toString()}` as Href);
  };

  const handleApple = async () => {
    if (busy) return;
    setBusy('apple');
    try {
      const result = await signInWithApple();
      if (result) await routeAfter(result.user, result.fullName);
    } catch (e: any) {
      // User cancelled the native sheet — not an error worth surfacing.
      if (e?.code !== 'ERR_REQUEST_CANCELED' && e?.code !== 'ERR_CANCELED') {
        Alert.alert('Apple Sign In Failed', e?.message ?? 'Something went wrong.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy('google');
    try {
      const result = await signInWithGoogle();
      if (result) await routeAfter(result.user, result.fullName);
    } catch (e: any) {
      Alert.alert('Google Sign In Failed', e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: onDark ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }]} />
        <Text style={[styles.dividerText, { color: onDark ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }]}>or</Text>
        <View style={[styles.line, { backgroundColor: onDark ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }]} />
      </View>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            onDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={14}
          style={styles.appleBtn}
          onPress={handleApple}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.googleBtn,
          {
            backgroundColor: onDark ? '#FFFFFF' : '#FFFFFF',
            borderColor: onDark ? '#FFFFFF' : '#D1D5DB',
            opacity: pressed || busy === 'google' ? 0.85 : 1,
          },
        ]}
        onPress={handleGoogle}
        disabled={!!busy}
      >
        <AntDesign name="google" size={18} color="#4285F4" />
        <Text style={styles.googleText}>
          {busy === 'google' ? 'Signing in...' : 'Continue with Google'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '500' },
  appleBtn: { width: '100%', height: 52 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderRadius: 14, paddingVertical: 15, width: '100%',
  },
  googleText: { color: '#1F2937', fontSize: 16, fontWeight: '700' },
});
