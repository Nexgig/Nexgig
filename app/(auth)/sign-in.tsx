import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { MOCK_MANAGER, MOCK_ARTIST } from '@/lib/mock-data';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { signIn as supabaseSignIn } from '@/lib/auth';
import { syncUserData } from '@/lib/sync';
import { getUserProfile } from '@/lib/api';

export default function SignInScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const signIn = useAuthStore((s) => s.signIn);
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
  if (!email.trim()) { Alert.alert('Error', 'Please enter your email'); return; }
  if (!password.trim()) { Alert.alert('Error', 'Please enter your password'); return; }
  
  setIsLoading(true);
  try {
    const data = await supabaseSignIn(email.trim().toLowerCase(), password);
    if (data.user) {
      const profile = await getUserProfile(data.user.id);
      setCurrentUser({
        id: data.user.id,
        email: profile.email,
        phone: profile.phone ?? '',
        accountType: profile.account_type,
        fullName: profile.full_name,
        profilePhotoUrl: profile.profile_photo_url ?? undefined,
        isPhoneVerified: profile.is_phone_verified ?? false,
        isEmailVerified: profile.is_email_verified ?? false,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      });
      await syncUserData(data.user.id, profile.account_type);
      router.replace('/' as Href);
    }
  } catch (error: any) {
    Alert.alert('Sign In Failed', error.message ?? 'Something went wrong.');
  } finally {
    setIsLoading(false);
  }
};

  const handleDemoManager = () => {
    setCurrentUser(MOCK_MANAGER);
    router.replace('/' as Href);
  };

  const handleDemoDJ = () => {
    setCurrentUser(MOCK_ARTIST);
    router.replace('/' as Href);
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
        </View>

        {/* Demo Shortcuts */}
        <View style={[styles.demoSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.demoTitle, { color: colors.muted }]}>Demo Access</Text>
          <View style={styles.demoButtons}>
            <Pressable
              style={({ pressed }) => [styles.demoBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={handleDemoManager}
            >
              <MaterialIcons name="business" size={18} color={colors.primary} />
              <Text style={[styles.demoBtnText, { color: colors.foreground }]}>Manager Demo</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.demoBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={handleDemoDJ}
            >
              <MaterialIcons name="headset" size={18} color={colors.primary} />
              <Text style={[styles.demoBtnText, { color: colors.foreground }]}>Artist Demo</Text>
            </Pressable>
          </View>
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
    backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  demoSection: { borderTopWidth: 1, paddingTop: 24, marginTop: 8 },
  demoTitle: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  demoButtons: { flexDirection: 'row', gap: 12 },
  demoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14,
  },
  demoBtnText: { fontSize: 14, fontWeight: '600' },
});
