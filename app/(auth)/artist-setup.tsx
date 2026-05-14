import { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { GenreType, InstrumentType, Gender } from '@/lib/types';
import { CountryPicker } from '@/components/country-picker';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';

const DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW = 'nexgig:dj:defaultCalendarView';

const GENRES: GenreType[] = [
  'House', 'Tech House', 'Afro House', 'Melodic House & Techno', 'Deep House',
  'EDM / Commercial', 'Hip Hop / R&B', 'Afrobeats', 'Amapiano', 'Khaleeji',
  'Pop / Top 40', 'Reggaeton', 'R&B/Soul', 'Dancehall', 'Disco / Funk',
  '90s / 2000s', '80s',
];

const INSTRUMENTS: InstrumentType[] = [
  'CDJ / Turntables', 'Synthesizer', 'Saxophone', 'Trumpet', 'Guitar',
  'Violin', 'Flute', 'Vocalist', 'Piano / Keys', 'Oud', 'Darbuka', 'Bongos',
];

const TOTAL_STEPS = 4;
const ANIM_DURATION = 350;
const ANIM_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export default function DJSetupScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const updateArtistProfile = useLineupStore((s) => s.updateArtistProfile);
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [form, setForm] = useState({
    fullName: '', // Artist Name (stage name)
    fullLegalName: '', // Legal name (private)
    username: '', // Unique identifier (private)
    email: '', // Email address
    bio: '',
    basedIn: '',
    nationality: '',
    yearsOfExperience: '',
    gender: '' as Gender | '',
    primaryGenre: '' as GenreType | '',
    secondaryGenres: [] as GenreType[],
    instruments: [] as InstrumentType[],
    minRate: '',
    soundcloud: '', mixcloud: '', instagram: '', spotify: '',
  });
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');

  const isEmailTaken = useLineupStore((s) => s.isEmailTaken);
  const isUsernameTaken = useLineupStore((s) => s.isUsernameTaken);
  const addArtistUser = useLineupStore((s) => s.addArtistUser);

  // Username format validation
  const usernameValid = useMemo(() => /^[a-z0-9_]+$/.test(form.username) || form.username === '', [form.username]);

  // Generate username suggestions when taken
  const usernameSuggestions = useMemo(() => {
    if (!form.username || !isUsernameTaken(form.username)) return [];
    const base = form.username.replace(/[0-9_]+$/, '');
    const suggestions: string[] = [];
    for (let i = 1; suggestions.length < 3; i++) {
      const candidate = `${base}_${i}`;
      if (!isUsernameTaken(candidate)) suggestions.push(candidate);
      if (i > 20) break;
    }
    return suggestions;
  }, [form.username, isUsernameTaken]);
  const [isLoading, setIsLoading] = useState(false);

  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animateToStep = useCallback((newStep: number, direction: 'forward' | 'back') => {
    setIsAnimating(true);
    translateX.value = withTiming(direction === 'forward' ? -screenWidth : screenWidth, {
      duration: ANIM_DURATION, easing: ANIM_EASING,
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

  const update = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggleSecondaryGenre = (g: GenreType) => {
    setForm((f) => {
      const current = f.secondaryGenres;
      if (current.includes(g)) return { ...f, secondaryGenres: current.filter((x) => x !== g) };
      if (current.length >= 5) return f;
      return { ...f, secondaryGenres: [...current, g] };
    });
  };

  const toggleInstrument = (i: InstrumentType) => {
    setForm((f) => {
      const current = f.instruments;
      if (current.includes(i)) return { ...f, instruments: current.filter((x) => x !== i) };
      return { ...f, instruments: [...current, i] };
    });
  };

  const handleNext = async () => {
    if (isAnimating) return;

    if (step === 1) {
      if (!form.fullName.trim()) {
        Alert.alert('Required', 'Please enter your artist name.');
        return;
      }
      if (!form.fullLegalName.trim()) {
        Alert.alert('Required', 'Please enter your full legal name.');
        return;
      }
      if (!form.username.trim()) {
        Alert.alert('Required', 'Please choose a username.');
        return;
      }
      if (!usernameValid) {
        Alert.alert('Invalid Username', 'Username can only contain lowercase letters, numbers, and underscores.');
        return;
      }
      if (isUsernameTaken(form.username)) {
        setUsernameError('This username is already taken.');
        return;
      }
      if (!form.email.trim()) {
        Alert.alert('Required', 'Please enter your email address.');
        return;
      }
      if (isEmailTaken(form.email)) {
        setEmailError('An account with this email already exists');
        return;
      }
      setUsernameError('');
      setEmailError('');
    }
    if (step === 2 && !form.primaryGenre) {
      Alert.alert('Required', 'Please select your primary genre.');
      return;
    }
    if (step < TOTAL_STEPS) {
      animateToStep(step + 1, 'forward');
      return;
    }

    const hasMediaLink = form.soundcloud || form.mixcloud || form.instagram || form.spotify;
    if (!hasMediaLink) {
      Alert.alert('Required', 'Please add at least one media link.');
      return;
    }

    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);

    const newDJId = 'dj-new-' + Date.now();
    const newDJ: import('@/lib/types').User = {
      id: newDJId,
      email: form.email.trim().toLowerCase(),
      phone: '',
      accountType: 'artist' as const,
      fullName: form.fullName.trim(),
      fullLegalName: form.fullLegalName.trim(),
      username: form.username.trim().toLowerCase(),
      bio: form.bio,
      location: undefined,
      yearsOfExperience: form.yearsOfExperience ? parseInt(form.yearsOfExperience, 10) : undefined,
      isPhoneVerified: false,
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addArtistUser(newDJ);
    setCurrentUser(newDJ);
    updateArtistProfile(newDJId, {
      userId: newDJId,
      primaryGenre: form.primaryGenre as import('@/lib/types').GenreType,
      secondaryGenres: form.secondaryGenres,
      instruments: form.instruments,
      gender: form.gender || undefined,
      minRate: form.minRate ? parseFloat(form.minRate) : undefined,
      basedIn: form.basedIn || undefined,
      nationality: form.nationality || undefined,
      instagramUrl: form.instagram || undefined,
      soundcloudUrl: form.soundcloud || undefined,
      mixcloudUrl: form.mixcloud || undefined,
      spotifyUrl: form.spotify || undefined,
    });
    await AsyncStorage.setItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW, 'month');
    router.replace('/(artist)/(tabs)/home' as Href);
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
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <View style={styles.stepIndicator}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View key={i} style={[styles.stepDot, { backgroundColor: i + 1 <= step ? colors.primary : colors.border }]} />
              ))}
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {displayStep === 1 && 'Your Identity'}
              {displayStep === 2 && 'Your Sound'}
              {displayStep === 3 && 'Rate & Instruments'}
              {displayStep === 4 && 'Media Links'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Step {displayStep} of {TOTAL_STEPS}</Text>
          </View>

          {/* Step 1: Identity */}
          {displayStep === 1 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Artist Name *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Your stage name — shown publicly in the app</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="DJ Kai" placeholderTextColor={colors.muted}
                  value={form.fullName} onChangeText={(v) => update('fullName', v)} returnKeyType="next"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Full Legal Name *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Your real name — kept private, used for future invoicing</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Kai Nakamura" placeholderTextColor={colors.muted}
                  value={form.fullLegalName} onChangeText={(v) => update('fullLegalName', v)} returnKeyType="next"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Username *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Unique identifier — lowercase letters, numbers, underscores only</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: usernameError ? '#EF4444' : colors.border, color: colors.foreground }]}
                  placeholder="kai_nakamura" placeholderTextColor={colors.muted}
                  value={form.username} onChangeText={(v) => { update('username', v.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError(''); }} returnKeyType="next"
                  autoCapitalize="none" autoCorrect={false}
                />
                {usernameError ? <Text style={[styles.errorText, { color: '#EF4444' }]}>{usernameError}</Text> : null}
                {usernameSuggestions.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Try:</Text>
                    {usernameSuggestions.map((s) => (
                      <Pressable key={s} onPress={() => { update('username', s); setUsernameError(''); }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Email *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: emailError ? '#EF4444' : colors.border, color: colors.foreground }]}
                  placeholder="kai@example.com" placeholderTextColor={colors.muted}
                  value={form.email} onChangeText={(v) => { update('email', v); setEmailError(''); }} returnKeyType="next"
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                />
                {emailError ? <Text style={[styles.errorText, { color: '#EF4444' }]}>{emailError}</Text> : null}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Bio (max 500 chars)</Text>
                <TextInput
                  style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Tell venues about your style and experience..." placeholderTextColor={colors.muted}
                  value={form.bio} onChangeText={(v) => update('bio', v)} multiline numberOfLines={4} maxLength={500}
                />
                <Text style={[styles.charCount, { color: colors.muted }]}>{form.bio.length}/500</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Gender</Text>
                <View style={styles.chipRow}>
                  {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                    <Pressable key={g} style={[styles.chip, { borderColor: form.gender === g ? colors.primary : colors.border, backgroundColor: form.gender === g ? colors.primary : colors.surface }]} onPress={() => update('gender', g)}>
                      <Text style={[styles.chipText, { color: form.gender === g ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Years of Experience (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="8" placeholderTextColor={colors.muted}
                  value={form.yearsOfExperience} onChangeText={(v) => update('yearsOfExperience', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad" returnKeyType="done"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Based In</Text>
                <CountryPicker
                  value={form.basedIn}
                  onChange={(v) => update('basedIn', v)}
                  placeholder="Select country"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Nationality</Text>
                <CountryPicker
                  value={form.nationality}
                  onChange={(v) => update('nationality', v)}
                  placeholder="Select nationality"
                />
              </View>
            </View>
          )}

          {/* Step 2: Sound */}
          {displayStep === 2 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Primary Genre *</Text>
                <View style={styles.chipGrid}>
                  {GENRES.map((g) => (
                    <Pressable key={g} style={[styles.chip, { borderColor: form.primaryGenre === g ? colors.primary : colors.border, backgroundColor: form.primaryGenre === g ? colors.primary : colors.surface }]} onPress={() => update('primaryGenre', g)}>
                      <Text style={[styles.chipText, { color: form.primaryGenre === g ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Secondary Genres (up to 5)</Text>
                <View style={styles.chipGrid}>
                  {GENRES.filter((g) => g !== form.primaryGenre).map((g) => (
                    <Pressable key={g} style={[styles.chip, { borderColor: form.secondaryGenres.includes(g) ? colors.primary : colors.border, backgroundColor: form.secondaryGenres.includes(g) ? colors.primary : colors.surface }]} onPress={() => toggleSecondaryGenre(g)}>
                      <Text style={[styles.chipText, { color: form.secondaryGenres.includes(g) ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Step 3: Rate & Instruments */}
          {displayStep === 3 && (
            <View style={styles.form}>
              <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="lock" size={16} color={colors.muted} />
                <Text style={[styles.infoText, { color: colors.muted }]}>Your rate is only visible to managers — never to other artists.</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Minimum Rate (AED, optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="3000" placeholderTextColor={colors.muted}
                  value={form.minRate} onChangeText={(v) => update('minRate', v)}
                  keyboardType="number-pad" returnKeyType="done"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Instruments</Text>
                <Text style={[styles.hint, { color: colors.muted }]}>Select all that apply</Text>
                <View style={styles.chipGrid}>
                  {INSTRUMENTS.map((i) => (
                    <Pressable key={i} style={[styles.chip, { borderColor: form.instruments.includes(i) ? colors.primary : colors.border, backgroundColor: form.instruments.includes(i) ? colors.primary : colors.surface }]} onPress={() => toggleInstrument(i)}>
                      <Text style={[styles.chipText, { color: form.instruments.includes(i) ? '#fff' : colors.foreground }]}>{i}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Step 4: Media Links */}
          {displayStep === 4 && (
            <View style={styles.form}>
              <Text style={[styles.infoText, { color: colors.muted, marginBottom: 8 }]}>At least one link is required.</Text>
              {(['soundcloud', 'instagram', 'spotify', 'mixcloud'] as const).map((platform) => (
                <View key={platform} style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={`https://${platform}.com/yourprofile`} placeholderTextColor={colors.muted}
                    value={form[platform]} onChangeText={(v) => update(platform, v)}
                    autoCapitalize="none" keyboardType="url" returnKeyType="done"
                  />
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
            onPress={handleNext}
            disabled={isLoading || isAnimating}
          >
            <Text style={styles.nextBtnText}>{isLoading ? 'Creating profile...' : step < TOTAL_STEPS ? 'Continue' : 'Complete Profile'}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 28 },
  backBtn: { marginBottom: 16, alignSelf: 'flex-start', padding: 4 },
  stepIndicator: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  stepDot: { width: 32, height: 4, borderRadius: 2 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  form: { gap: 20, marginBottom: 32 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  charCount: { fontSize: 12, textAlign: 'right' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '500' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  infoText: { fontSize: 13, lineHeight: 18, flex: 1 },
  fieldHint: { fontSize: 12, marginTop: -4 },
  errorText: { fontSize: 12, marginTop: 2 },
  nextBtn: { backgroundColor: '#2E75B6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
