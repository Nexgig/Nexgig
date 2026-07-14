import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { CountryPicker } from '@/components/country-picker';
import { PhoneInput } from '@/components/phone-input';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_DEFAULT_CALENDAR_VIEW } from '@/app/(manager)/settings';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/send-email';
import { AvatarImage } from '@/components/ui/avatar-image';
import { AvatarPicker } from '@/components/ui/avatar-picker';

const TOTAL_STEPS = 3;
const ANIM_DURATION = 350;
const ANIM_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export default function ManagerRegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  // OAuth mode: user already authenticated via Apple/Google, session exists.
  // We skip the email/password signup and pre-fill name/email.
  const { oauth, name: oauthName, email: oauthEmail } = useLocalSearchParams<{ oauth?: string; name?: string; email?: string }>();
  const isOAuth = oauth === '1';

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: oauthName ?? '',
    email: oauthEmail ?? '',
    password: '',
    phone: '',
    basedIn: '',
    companyName: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  // Avatar (optional, chosen on step 2). Managers upload a real photo later, from
  // Edit Profile — signup is avatar-only.
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animateToStep = useCallback((newStep: number, direction: 'forward' | 'back') => {
    setIsAnimating(true);
    translateX.value = withTiming(direction === 'forward' ? -screenWidth : screenWidth, {
      duration: ANIM_DURATION,
      easing: ANIM_EASING,
    }, () => {
      runOnJS(setDisplayStep)(newStep);
      runOnJS(setStep)(newStep);
      translateX.value = direction === 'forward' ? screenWidth : -screenWidth;
      translateX.value = withTiming(0, { duration: ANIM_DURATION, easing: ANIM_EASING }, () => {
        runOnJS(setIsAnimating)(false);
      });
    });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [screenWidth, translateX]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleNext = async () => {
    if (isAnimating) return;

    // ✅ Step 1 — sign up with email + password (skipped in OAuth mode)
    if (step === 1) {
      if (isOAuth) {
        // Session already exists from Apple/Google. Just need a name.
        if (!form.fullName.trim()) {
          Alert.alert('Required', 'Please enter your full name.');
          return;
        }
        animateToStep(2, 'forward');
        return;
      }

      if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
        Alert.alert('Required', 'Please fill in all fields.');
        return;
      }
      if (form.password.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return;
      }

      setIsLoading(true);

      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (signUpError) {
        setIsLoading(false);
        Alert.alert('Sign up failed', signUpError.message);
        return;
      }

      // Sign in immediately after signup so session is ready for Step 2
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      setIsLoading(false);

      if (signInError) {
        Alert.alert('Sign in failed', signInError.message);
        return;
      }

      animateToStep(2, 'forward');
      return;
    }

    // ✅ Step 2 — Profile Photo (optional): just advance to the profile details.
    if (step === 2) {
      animateToStep(3, 'forward');
      return;
    }

    // ✅ Step 3 — insert manager profile into Supabase
    setIsLoading(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsLoading(false);
      Alert.alert('Error', 'Session not found. Please restart registration.');
      return;
    }

    // Insert into users table first
    const { error: userInsertError } = await supabase.from('users').upsert({
      id: user.id,
      email: form.email.trim().toLowerCase(),
      full_name: form.fullName.trim(),
      account_type: 'manager',
      phone: form.phone.trim(),
      is_phone_verified: false,
      is_email_verified: false,
    }, { onConflict: 'id' });

    if (userInsertError) {
      setIsLoading(false);
      Alert.alert('Error saving profile', userInsertError.message);
      return;
    }

    // Managers pick a bundled avatar at signup; no photo upload here. They can
    // still upload one later from Edit Profile.
    const photoUrl: string | null = null;

    // Insert into managers table
    const { error: insertError } = await supabase.from('managers').upsert({
      id: user.id,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      full_name: form.fullName.trim(),
      based_in: form.basedIn || null,
      company_name: form.companyName.trim() || null,
      profile_photo_url: photoUrl,
      avatar_id: avatarId ?? null,
    }, { onConflict: 'id' });

    setIsLoading(false);

    if (insertError) {
      Alert.alert('Error saving profile', insertError.message);
      return;
    }

    setCurrentUser({
      id: user.id,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      accountType: 'manager' as const,
      fullName: form.fullName.trim(),
      location: undefined,
      companyName: form.companyName.trim() || undefined,
      profilePhotoUrl: photoUrl ?? undefined,
      avatarId: avatarId ?? undefined,
      isPhoneVerified: false,
      isEmailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Welcome email (transactional, fire-and-forget — never blocks signup).
    sendEmail(user.id, 'welcome_manager');

    await AsyncStorage.setItem(STORAGE_KEY_DEFAULT_CALENDAR_VIEW, 'month');
    router.replace('/(manager)/(tabs)/dashboard' as Href);
  };

  const handleBack = () => {
    if (isAnimating) return;
    if (step > 1) {
      animateToStep(step - 1, 'back');
    } else {
      router.back();
    }
  };

  const loadingLabel = () => {
    if (!isLoading) return step < TOTAL_STEPS ? 'Continue' : 'Create Account';
    if (step === 1) return 'Creating account...';
    return 'Saving profile...';
  };

  return (
    <ScreenContainer>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, { paddingBottom: 40 + keyboardHeight }]} keyboardShouldPersistTaps="handled">
        <Animated.View style={animatedStyle}>

          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <View style={styles.stepIndicator}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.stepDot,
                    { backgroundColor: i + 1 <= step ? colors.primary : colors.border }
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {displayStep === 1 && 'Create Account'}
              {displayStep === 2 && 'Profile Photo'}
              {displayStep === 3 && 'Your Profile'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {displayStep === 1 && 'Step 1 of 3 — Basic information'}
              {displayStep === 2 && 'Step 2 of 3 — Pick an avatar'}
              {displayStep === 3 && 'Step 3 of 3 — Tell us about yourself'}
            </Text>
          </View>

          {/* Step 1: Basic Info + Password */}
          {displayStep === 1 && (
            <View style={styles.form}>
              <InputField
                label="Full Name"
                value={form.fullName}
                onChangeText={(v) => update('fullName', v)}
                placeholder="Alex Thompson"
                colors={colors}
              />
              {!isOAuth && (
                <InputField
                  label="Email Address"
                  value={form.email}
                  onChangeText={(v) => update('email', v)}
                  placeholder="alex@example.com"
                  keyboardType="email-address"
                  colors={colors}
                />
              )}
              {!isOAuth && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.passwordInput, { borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={colors.muted}
                    value={form.password}
                    onChangeText={(v) => update('password', v)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                  <Pressable
                    onPress={() => setShowPassword((p) => !p)}
                    style={[styles.eyeBtn, { borderColor: colors.border }]}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
              </View>
              )}
              <PhoneInput
                label="Phone Number"
                optional={false}
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </View>
          )}

          {/* Step 2: Profile Photo (optional) */}
          {displayStep === 2 && (
            <View style={styles.form}>
              <Text style={[styles.infoText, { color: colors.muted, marginBottom: 4 }]}>Optional — pick an avatar. You can change this anytime.</Text>
              <View style={styles.photoStep}>
                <AvatarImage avatarId={avatarId ?? undefined} seed={form.fullName} name={form.fullName} size={120} variant="manager" />
                <Pressable onPress={() => setShowAvatarPicker(true)} style={({ pressed }) => [styles.photoSecondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                  <MaterialIcons name="face" size={18} color={colors.foreground} />
                  <Text style={[styles.photoSecondaryBtnText, { color: colors.foreground }]}>Choose an Avatar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 3: Profile Details */}
          {displayStep === 3 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Based In</Text>
                <CountryPicker
                  value={form.basedIn}
                  onChange={(v) => update('basedIn', v)}
                  placeholder="Select country"
                />
              </View>
              <InputField
                label="Company Name"
                value={form.companyName}
                onChangeText={(v) => update('companyName', v)}
                placeholder="The company you work for"
                colors={colors}
              />
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
            onPress={handleNext}
            disabled={isLoading || isAnimating}
          >
            <Text style={styles.nextBtnText}>{loadingLabel()}</Text>
          </Pressable>

        </Animated.View>
      </ScrollView>

      <AvatarPicker
        visible={showAvatarPicker}
        selectedId={avatarId}
        onSelect={(id) => { setAvatarId(id); setShowAvatarPicker(false); }}
        onClose={() => setShowAvatarPicker(false)}
      />
    </ScreenContainer>
  );
}

function InputField({ label, value, onChangeText, placeholder, keyboardType, colors }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        returnKeyType="next"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 16, alignSelf: 'flex-start', padding: 4 },
  stepIndicator: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  stepDot: { width: 32, height: 4, borderRadius: 2 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 20, marginBottom: 32 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  passwordRow: { flexDirection: 'row', gap: 8 },
  passwordInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  eyeBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  nextBtn: { backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  infoText: { fontSize: 13, lineHeight: 18 },
  photoStep: { alignItems: 'center', gap: 16, paddingTop: 12 },
  photoSecondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  photoSecondaryBtnText: { fontSize: 15, fontWeight: '600' },
});