import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { OAuthButtons } from '@/components/oauth-buttons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { signIn as supabaseSignIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);

  // Email may be pre-filled when arriving from the welcome screen's email step.
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(emailParam ?? '');
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

        Alert.alert('Error', 'Account not found. Please register first.');
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
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + keyboardHeight }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.brandSection}>
            <Image
              source={require('@/assets/images/nexgig-icon.png')}
              style={styles.brandIcon}
              resizeMode="contain"
            />
            <Text style={[styles.brandName, { color: colors.foreground }]}>Nexgig</Text>
            <Text style={[styles.brandSlogan, { color: colors.muted }]}>Every booking, verified.</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Enter your email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
            <View style={[styles.passwordContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.foreground }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.signInBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            <Text style={styles.signInBtnText}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Text>
          </Pressable>

          <OAuthButtons />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start', padding: 4 },
  brandSection: { alignItems: 'center', gap: 6, marginTop: 8 },
  brandIcon: { width: 64, height: 64, borderRadius: 16 },
  brandName: { fontSize: 28, fontWeight: '800' },
  brandSlogan: { fontSize: 15, lineHeight: 22 },
  form: { gap: 20, marginBottom: 32 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, lineHeight: 20,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16,
  },
  passwordInput: { flex: 1, paddingVertical: 14, fontSize: 15 },
  eyeBtn: { padding: 4 },
  signInBtn: {
    backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});