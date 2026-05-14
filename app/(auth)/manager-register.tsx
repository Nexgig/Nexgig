import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { CountryPicker } from '@/components/country-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_DEFAULT_CALENDAR_VIEW } from '@/app/(manager)/settings';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';

const TOTAL_STEPS = 4;
const ANIM_DURATION = 350;
const ANIM_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export default function ManagerRegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    emailOtp: '',
    phoneOtp: '',
    basedIn: '',
    yearsOfExperience: '',
    bio: '',
  });
  const [isLoading, setIsLoading] = useState(false);

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

    if (step === 1) {
      if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
        Alert.alert('Required', 'Please fill in all fields.');
        return;
      }
    }
    if (step === 2) {
      if (!form.emailOtp.trim()) {
        Alert.alert('Required', 'Please enter the OTP sent to your email.');
        return;
      }
    }
    if (step === 3) {
      if (!form.phoneOtp.trim()) {
        Alert.alert('Required', 'Please enter the OTP sent to your phone.');
        return;
      }
    }
    if (step < TOTAL_STEPS) {
      animateToStep(step + 1, 'forward');
      return;
    }

    // Final step — create account
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);

    const newManager = {
      id: 'manager-new-' + Date.now(),
      email: form.email,
      phone: form.phone,
      accountType: 'manager' as const,
      fullName: form.fullName,
      bio: form.bio,
      location: undefined,
      yearsOfExperience: form.yearsOfExperience ? parseInt(form.yearsOfExperience) : undefined,
      isPhoneVerified: true,
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentUser(newManager);
    // Set Venue as the default calendar view for new users
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

  return (
    <ScreenContainer>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
            {displayStep === 2 && 'Verify Email'}
            {displayStep === 3 && 'Verify Phone'}
            {displayStep === 4 && 'Your Profile'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {displayStep === 1 && 'Step 1 of 4 — Basic information'}
            {displayStep === 2 && 'Step 2 of 4 — Check your inbox'}
            {displayStep === 3 && 'Step 3 of 4 — Check your messages'}
            {displayStep === 4 && 'Step 4 of 4 — Tell us about yourself'}
          </Text>
        </View>

          {/* Step 1: Basic Info */}
          {displayStep === 1 && (
            <View style={styles.form}>
              <InputField label="Full Name" value={form.fullName} onChangeText={(v) => update('fullName', v)} placeholder="Alex Thompson" colors={colors} />
              <InputField label="Email Address" value={form.email} onChangeText={(v) => update('email', v)} placeholder="alex@example.com" keyboardType="email-address" colors={colors} />
              <InputField label="Phone Number" value={form.phone} onChangeText={(v) => update('phone', v)} placeholder="+971 50 123 4567" keyboardType="phone-pad" colors={colors} />
            </View>
          )}

          {/* Step 2: Email OTP */}
          {displayStep === 2 && (
            <View style={styles.form}>
              <Text style={[styles.otpInfo, { color: colors.muted }]}>
                We've sent a 6-digit code to {form.email}. Enter it below to verify your email.
              </Text>
              <InputField label="Email OTP" value={form.emailOtp} onChangeText={(v) => update('emailOtp', v)} placeholder="123456" keyboardType="number-pad" colors={colors} />
              <Text style={[styles.demoHint, { color: colors.primary }]}>Demo: enter any 6 digits</Text>
            </View>
          )}

          {/* Step 3: Phone OTP */}
          {displayStep === 3 && (
            <View style={styles.form}>
              <Text style={[styles.otpInfo, { color: colors.muted }]}>
                We've sent a 6-digit code to {form.phone}. Enter it below to verify your phone.
              </Text>
              <InputField label="Phone OTP" value={form.phoneOtp} onChangeText={(v) => update('phoneOtp', v)} placeholder="123456" keyboardType="number-pad" colors={colors} />
              <Text style={[styles.demoHint, { color: colors.primary }]}>Demo: enter any 6 digits</Text>
            </View>
          )}

          {/* Step 4: Profile Details */}
          {displayStep === 4 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Based In</Text>
                <CountryPicker
                  value={form.basedIn}
                  onChange={(v) => update('basedIn', v)}
                  placeholder="Select country"
                />
              </View>
              <InputField label="Years of Experience (optional)" value={form.yearsOfExperience} onChangeText={(v) => update('yearsOfExperience', v)} placeholder="8" keyboardType="number-pad" colors={colors} />
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Bio (optional)</Text>
                <TextInput
                  style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Tell DJs about yourself and your venues..."
                  placeholderTextColor={colors.muted}
                  value={form.bio}
                  onChangeText={(v) => update('bio', v)}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={[styles.charCount, { color: colors.muted }]}>{form.bio.length}/500</Text>
              </View>
            </View>
          )}
        <Pressable
          style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
          onPress={handleNext}
          disabled={isLoading || isAnimating}
        >
          <Text style={styles.nextBtnText}>
            {isLoading ? 'Creating account...' : step < TOTAL_STEPS ? 'Continue' : 'Create Account'}
          </Text>
        </Pressable>
        </Animated.View>
      </ScrollView>
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
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
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
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 12, textAlign: 'right' },
  otpInfo: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  demoHint: { fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
  cityScroll: { marginHorizontal: -4 },
  cityRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4 },
  cityChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  cityChipText: { fontSize: 13, fontWeight: '500' },
  nextBtn: { backgroundColor: '#2E75B6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
