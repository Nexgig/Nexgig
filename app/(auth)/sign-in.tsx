import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image } from '@/lib/rn';
import { useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { signIn as supabaseSignIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);

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

        // ✅ Check managers table by email
        const { data: managerProfile } = await supabase
          .from('managers')
          .select('*')
          .eq('email', data.user.email ?? '')
          .maybeSingle();

        if (managerProfile) {
          // ✅ Ensure users table has correct row for this auth ID
          await supabase.from('users').upsert({
            id: data.user.id,
            email: managerProfile.email,
            full_name: managerProfile.full_name,
            account_type: 'manager',
            phone: managerProfile.phone ?? '',
            is_phone_verified: false,
            is_email_verified: true,
          }, { onConflict: 'id' });

          setCurrentUser({
            id: data.user.id,
            email: managerProfile.email,
            phone: managerProfile.phone ?? '',
            accountType: 'manager',
            fullName: managerProfile.full_name,
            // Hydrate profile fields from the managers row so they survive
            // sign-out → sign-in (previously only full_name + phone were set).
            bio: managerProfile.bio ?? undefined,
            location: managerProfile.based_in ?? undefined,
            companyName: managerProfile.company_name ?? undefined,
            profilePhotoUrl: managerProfile.profile_photo_url ?? undefined,
            avatarId: managerProfile.avatar_id ?? undefined,
            isPhoneVerified: false,
            isEmailVerified: true,
            createdAt: data.user.created_at,
            updatedAt: data.user.created_at,
          });
          router.replace('/(manager)/(tabs)/dashboard' as Href);
          return;
        }

        // ✅ Check artists table by email
        const { data: artistProfile } = await supabase
          .from('artists')
          .select('*')
          .eq('email', data.user.email ?? '')
          .maybeSingle();

        if (artistProfile) {
          // Phone is stored on the users row (not artists), so read it back too.
          const { data: artistUserRow } = await supabase
            .from('users')
            .select('phone, is_phone_verified')
            .eq('id', data.user.id)
            .maybeSingle();

          setCurrentUser({
            id: data.user.id,
            email: artistProfile.email,
            phone: artistUserRow?.phone ?? '',
            accountType: 'artist',
            fullName: artistProfile.full_name,
            // Hydrate the private/profile fields from the artists row so they
            // survive sign-out → sign-in (previously only set at signup).
            fullLegalName: artistProfile.full_legal_name ?? undefined,
            username: artistProfile.username ?? undefined,
            bio: artistProfile.bio ?? undefined,
            location: artistProfile.based_in ?? undefined,
            yearsOfExperience: artistProfile.years_of_experience ?? undefined,
            profilePhotoUrl: artistProfile.profile_photo_url ?? undefined,
            avatarId: artistProfile.avatar_id ?? undefined,
            isPhoneVerified: artistUserRow?.is_phone_verified ?? false,
            isEmailVerified: true,
            createdAt: data.user.created_at,
            updatedAt: data.user.created_at,
          });

          // Hydrate the artist PROFILE store (genres, instruments, gender, rate,
          // nationality, social links) — these live in useLineupStore.artistProfiles,
          // NOT on currentUser, and the profile/edit-profile screens read them from
          // there. Without this they came back empty after sign-out → sign-in.
          useLineupStore.getState().updateArtistProfile(data.user.id, {
            userId: data.user.id,
            primaryGenre: artistProfile.primary_genre ?? undefined,
            secondaryGenres: Array.isArray(artistProfile.secondary_genres) ? artistProfile.secondary_genres : [],
            instruments: Array.isArray(artistProfile.instruments) ? artistProfile.instruments : [],
            gender: artistProfile.gender ?? undefined,
            minRate: artistProfile.min_rate ?? undefined,
            basedIn: artistProfile.based_in ?? undefined,
            nationality: artistProfile.nationality ?? undefined,
            instagramUrl: artistProfile.instagram_url ?? undefined,
            soundcloudUrl: artistProfile.soundcloud_url ?? undefined,
            mixcloudUrl: artistProfile.mixcloud_url ?? undefined,
            spotifyUrl: artistProfile.spotify_url ?? undefined,
            isHistoryHidden: artistProfile.is_history_hidden ?? undefined,
          });

          router.replace('/(artist)/(tabs)/dashboard' as Href);
          return;
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
  passwordInput: { flex: 1, paddingVertical: 16, fontSize: 15, color: '#000000' },
  eyeBtn: { padding: 4 },
  primaryBtn: { backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});