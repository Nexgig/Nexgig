import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { GenreType, InstrumentType } from '@/lib/types';
import { CountryPicker } from '@/components/country-picker';
import { PhoneInput } from '@/components/phone-input';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/send-email';
import { AvatarImage } from '@/components/ui/avatar-image';
import { AvatarPicker } from '@/components/ui/avatar-picker';
import { AvatarPreviewModal } from '@/components/ui/avatar-preview-modal';
import { pickImage, uploadImageAsync, type PickSource } from '@/lib/upload';
import { validateEmail } from '@/lib/validate-email';

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
  const insets = useSafeAreaInsets();
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const updateArtistProfile = useLineupStore((s) => s.updateArtistProfile);
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  // OAuth mode: user already authenticated via Apple/Google, session exists.
  // We skip the email/password signup and pre-fill name/email.
  const { oauth, resume, name: oauthName, email: oauthEmail } = useLocalSearchParams<{ oauth?: string; resume?: string; name?: string; email?: string }>();
  // Both mean the same thing to this screen: an auth session already exists, so
  // skip signUp and hide the email/password fields.
  //   oauth  — Apple/Google signed them in before we got here.
  //   resume — they signed up, abandoned setup, and sign-in sent them back to finish.
  const hasSession = oauth === '1' || resume === '1';

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [form, setForm] = useState({
    fullName: oauthName ?? '',
    fullLegalName: '',
    email: oauthEmail ?? '',
    password: '',
    phone: '',
    bio: '',
    basedIn: '',
    nationality: '',
    primaryGenre: '' as GenreType | '',
    secondaryGenres: [] as GenreType[],
    instruments: [] as InstrumentType[],
    soundcloud: '', mixcloud: '', instagram: '', spotify: '',
  });
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Profile photo / avatar (optional, chosen on the Profile Photo step).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<PickSource>('library');

  const handlePickPhoto = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Choose from Library', onPress: async () => { const uri = await pickImage({ source: 'library' }); if (uri) { setPendingSource('library'); setPendingPhoto(uri); } } },
      { text: 'Take Photo', onPress: async () => { const uri = await pickImage({ source: 'camera' }); if (uri) { setPendingSource('camera'); setPendingPhoto(uri); } } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
      if (!form.fullName.trim()) { Alert.alert('Required', 'Please enter your artist name.'); return; }
      if (!form.fullLegalName.trim()) { Alert.alert('Required', 'Please enter your full legal name.'); return; }
      if (!hasSession) {
        const emailErr = validateEmail(form.email);
        if (emailErr) { setEmailError(emailErr); return; }
        setEmailError('');
        if (!form.password.trim() || form.password.length < 6) { Alert.alert('Required', 'Password must be at least 6 characters.'); return; }
      }
      if (form.instruments.length === 0) { Alert.alert('Required', 'Please select at least one — CDJ / Turntables if you DJ, or your instrument(s).'); return; }

      // Create the account here, not at the end. Same as the manager flow: the
      // "email already taken" error surfaces now, before three steps of typing.
      // Abandoning mid-signup is recoverable — sign-in resumes an unfinished setup
      // using the account_type stamped on the auth user below.
      if (!hasSession) {
        setIsLoading(true);
        const { error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          options: { data: { account_type: 'artist' } },
        });
        if (signUpError) {
          setIsLoading(false);
          const msg = signUpError.message ?? '';
          if (/already registered|already exists|user already/i.test(msg)) {
            setEmailError('That email is already registered. Try signing in instead.');
            return;
          }
          Alert.alert('Sign up failed', msg);
          return;
        }
        // Sign in immediately so the session is live for the rest of the flow
        // (the photo upload on submit needs it).
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        });
        setIsLoading(false);
        if (signInError) {
          Alert.alert('Sign in failed', signInError.message);
          return;
        }
      }
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

    // ✅ The account already exists — created at step 1 (or by OAuth). Just read
    //    the session back.
    const { data: { user: sessionUser }, error: getUserError } = await supabase.auth.getUser();
    if (getUserError || !sessionUser) {
      setIsLoading(false);
      Alert.alert('Error', 'Session not found. Please restart registration.');
      return;
    }
    const user = sessionUser;

    // The email used for profile rows: OAuth users use their session email.
    const profileEmail = (hasSession ? (user.email ?? form.email) : form.email).trim().toLowerCase();

    // ✅ Step 2 — insert into users table
    const { error: userInsertError } = await supabase.from('users').upsert({
  id: user.id,
  email: profileEmail,
  full_name: form.fullName.trim(),
  account_type: 'artist',
  phone: form.phone.trim(),
  is_phone_verified: false,
  is_email_verified: false,
}, { onConflict: 'id' });

    if (userInsertError) {
      setIsLoading(false);
      Alert.alert('Error saving profile', userInsertError.message);
      return;
    }

    // Auto-generate a unique username from the artist name (no manual entry).
    // Base = name lowercased with non-alphanumerics collapsed to underscores;
    // if taken, append 2, 3, 4… until free (DB unique constraint is the backstop).
    const baseUsername = form.fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'artist';
    let username = baseUsername;
    for (let n = 2; n <= 60; n++) {
      const { data: taken } = await supabase.from('artists').select('id').eq('username', username).maybeSingle();
      if (!taken) break;
      username = `${baseUsername}${n}`;
    }

    // Upload the chosen profile photo (if any) now that we have the user id.
    let photoUrl: string | null = null;
    if (photoUri) {
      try {
        photoUrl = await uploadImageAsync(photoUri, 'avatars', `avatar-${user.id}`);
      } catch (e: any) {
        setIsLoading(false);
        Alert.alert('Photo upload failed', e?.message ?? 'Could not upload your photo. Please try again.');
        return;
      }
    }

    // ✅ Step 3 — insert into artists table (retry username on a unique clash / race)
    const artistRow = {
      id: user.id,
      email: profileEmail,
      full_name: form.fullName.trim(),
      full_legal_name: form.fullLegalName.trim(),
      phone: form.phone.trim(),
      bio: form.bio || null,
      based_in: form.basedIn || null,
      nationality: form.nationality || null,
      primary_genre: form.primaryGenre || null,
      secondary_genres: form.secondaryGenres,
      instruments: form.instruments,
      profile_photo_url: photoUrl,
      avatar_id: avatarId ?? null,
      instagram_url: form.instagram ? `https://instagram.com/${form.instagram.replace(/^@/, '')}` : null,
      soundcloud_url: form.soundcloud || null,
      mixcloud_url: form.mixcloud || null,
      spotify_url: form.spotify || null,
    };
    let artistInsertError: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await supabase.from('artists').upsert({ ...artistRow, username }, { onConflict: 'id' });
      if (!error) { artistInsertError = null; break; }
      artistInsertError = error;
      if (error.code === '23505' && /username/i.test(error.message ?? '')) {
        username = `${baseUsername}${Math.floor(Math.random() * 9000) + 1000}`;
        continue;
      }
      break;
    }

    setIsLoading(false);

    if (artistInsertError) {
      Alert.alert('Error saving artist profile', artistInsertError.message);
      return;
    }

    // ✅ Set current user in store
    setCurrentUser({
      id: user.id,
      email: profileEmail,
      phone: form.phone.trim(),
      accountType: 'artist' as const,
      fullName: form.fullName.trim(),
      fullLegalName: form.fullLegalName.trim(),
      username,
      bio: form.bio,
      location: undefined,
      profilePhotoUrl: photoUrl ?? undefined,
      avatarId: avatarId ?? undefined,
      isPhoneVerified: false,
      isEmailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Populate the artist PROFILE store too (genres, instruments, rate,
    // nationality, social links). These live in useLineupStore.artistProfiles,
    // NOT on currentUser — the profile/edit-profile screens read them from there.
    // Without this the profile tab is blank right after signup until a re-sign-in.
    updateArtistProfile(user.id, {
      userId: user.id,
      primaryGenre: (form.primaryGenre || undefined) as GenreType,
      secondaryGenres: form.secondaryGenres,
      instruments: form.instruments,
      basedIn: form.basedIn || undefined,
      nationality: form.nationality || undefined,
      instagramUrl: form.instagram ? `https://instagram.com/${form.instagram.replace(/^@/, '')}` : undefined,
      soundcloudUrl: form.soundcloud || undefined,
      mixcloudUrl: form.mixcloud || undefined,
      spotifyUrl: form.spotify || undefined,
    });

    // Welcome email (transactional, fire-and-forget — never blocks signup).
    sendEmail(user.id, 'welcome_artist');

    await AsyncStorage.setItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW, 'month');
    router.replace('/(artist)/(tabs)/dashboard' as Href);
  };

  const handleBack = () => {
    if (isAnimating) return;
    if (step > 1) { animateToStep(step - 1, 'back'); } else { router.back(); }
  };

  return (
    <ScreenContainer>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
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
              {displayStep === 3 && 'Profile Photo'}
              {displayStep === 4 && 'Media Links'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Step {displayStep} of {TOTAL_STEPS}</Text>
          </View>

          {/* Step 1: Identity */}
          {displayStep === 1 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Artist Name *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Your stage name — shown publicly</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="DJ Kai" placeholderTextColor={colors.muted}
                  value={form.fullName} onChangeText={(v) => update('fullName', v)} returnKeyType="next" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Full Legal Name *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Kept private, used for invoicing</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Kai Nakamura" placeholderTextColor={colors.muted}
                  value={form.fullLegalName} onChangeText={(v) => update('fullLegalName', v)} returnKeyType="next" />
              </View>
              {!hasSession && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Email *</Text>
                <TextInput style={[styles.input, { borderColor: emailError ? '#EF4444' : colors.border, color: colors.foreground }]}
                  placeholder="kai@example.com" placeholderTextColor={colors.muted}
                  value={form.email} onChangeText={(v) => { update('email', v); setEmailError(''); }}
                  keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
                {emailError ? <Text style={[styles.errorText, { color: '#EF4444' }]}>{emailError}</Text> : null}
              </View>
              )}
              {!hasSession && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Password *</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Min. 6 characters" placeholderTextColor={colors.muted}
                  value={form.password} onChangeText={(v) => update('password', v)}
                  secureTextEntry autoCapitalize="none" returnKeyType="next" />
              </View>
              )}
              <PhoneInput
                label="Phone Number"
                optional={false}
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>What do you play? *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Pick CDJ / Turntables if you DJ, or your instrument(s)</Text>
                <View style={styles.chipGrid}>
                  {INSTRUMENTS.map((i) => (
                    <Pressable key={i} style={[styles.chip, { borderColor: form.instruments.includes(i) ? colors.primary : colors.border, backgroundColor: form.instruments.includes(i) ? colors.primary : 'transparent' }]} onPress={() => toggleInstrument(i)}>
                      <Text style={[styles.chipText, { color: form.instruments.includes(i) ? '#fff' : colors.foreground }]}>{i}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Based In</Text>
                <CountryPicker value={form.basedIn} onChange={(v) => update('basedIn', v)} placeholder="Select country" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Nationality</Text>
                <CountryPicker value={form.nationality} onChange={(v) => update('nationality', v)} placeholder="Select nationality" />
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
                    <Pressable key={g} style={[styles.chip, { borderColor: form.primaryGenre === g ? colors.primary : colors.border, backgroundColor: form.primaryGenre === g ? colors.primary : 'transparent' }]} onPress={() => update('primaryGenre', g)}>
                      <Text style={[styles.chipText, { color: form.primaryGenre === g ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Secondary Genres (up to 5)</Text>
                <View style={styles.chipGrid}>
                  {GENRES.filter((g) => g !== form.primaryGenre).map((g) => (
                    <Pressable key={g} style={[styles.chip, { borderColor: form.secondaryGenres.includes(g) ? colors.primary : colors.border, backgroundColor: form.secondaryGenres.includes(g) ? colors.primary : 'transparent' }]} onPress={() => toggleSecondaryGenre(g)}>
                      <Text style={[styles.chipText, { color: form.secondaryGenres.includes(g) ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Step 3: Profile Photo (optional) */}
          {displayStep === 3 && (
            <View style={styles.form}>
              <Text style={[styles.infoText, { color: colors.muted, marginBottom: 4 }]}>Optional — upload a photo or pick an avatar. You can change this anytime.</Text>
              <View style={styles.photoStep}>
                <AvatarImage uri={photoUri ?? undefined} avatarId={avatarId ?? undefined} seed={form.fullName} name={form.fullName} size={120} />
                <Pressable onPress={handlePickPhoto} style={({ pressed }) => [styles.photoPrimaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                  <MaterialIcons name="photo-camera" size={18} color="#fff" />
                  <Text style={styles.photoPrimaryBtnText}>Upload Photo</Text>
                </Pressable>
                <Pressable onPress={() => setShowAvatarPicker(true)} style={({ pressed }) => [styles.photoSecondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                  <MaterialIcons name="face" size={18} color={colors.foreground} />
                  <Text style={[styles.photoSecondaryBtnText, { color: colors.foreground }]}>Choose an Avatar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 4: Media Links */}
          {displayStep === 4 && (
            <View style={styles.form}>
              <Text style={[styles.infoText, { color: colors.muted, marginBottom: 8 }]}>At least one link is required.</Text>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Instagram</Text>
                <View style={[styles.instagramRow, { borderColor: colors.border }]}>
                  <Text style={[styles.instagramAt, { color: colors.muted, borderRightColor: colors.border }]}>@</Text>
                  <TextInput
                    style={[styles.instagramInput, { color: colors.foreground }]}
                    placeholder="yourhandle"
                    placeholderTextColor={colors.muted}
                    value={form.instagram.replace(/^@/, '')}
                    onChangeText={(v) => update('instagram', v.replace(/^@/, ''))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
              </View>
              {(['soundcloud', 'spotify', 'mixcloud'] as const).map((platform) => (
                <View key={platform} style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    placeholder={`https://${platform}.com/yourprofile`} placeholderTextColor={colors.muted}
                    value={form[platform]} onChangeText={(v) => update(platform, v)}
                    autoCapitalize="none" keyboardType="url" returnKeyType="done" />
                </View>
              ))}
            </View>
          )}

        </Animated.View>
      </ScrollView>
      {/* Pinned footer — Continue is always visible and lifts above the keyboard */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 10 : (insets.bottom || 16) }]}>
        <Pressable
          style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]}
          onPress={handleNext}
          disabled={isLoading || isAnimating}
        >
          <Text style={styles.nextBtnText}>{isLoading ? 'Creating profile...' : step < TOTAL_STEPS ? 'Continue' : 'Complete Profile'}</Text>
        </Pressable>
      </View>

      <AvatarPreviewModal
        uri={pendingPhoto}
        onConfirm={() => { if (pendingPhoto) { setPhotoUri(pendingPhoto); setAvatarId(null); } setPendingPhoto(null); }}
        onRetry={async () => { const uri = await pickImage({ source: pendingSource }); setPendingPhoto(uri ?? null); }}
        onCancel={() => setPendingPhoto(null)}
      />

      <AvatarPicker
        visible={showAvatarPicker}
        selectedId={avatarId}
        onSelect={(id) => { setAvatarId(id); setPhotoUri(null); setShowAvatarPicker(false); }}
        onClose={() => setShowAvatarPicker(false)}
      />
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
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, letterSpacing: 0 },
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 90, textAlignVertical: 'top', letterSpacing: 0 },
  charCount: { fontSize: 12, textAlign: 'right' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '500' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  infoText: { fontSize: 13, lineHeight: 18, flex: 1 },
  fieldHint: { fontSize: 12, marginTop: -4 },
  errorText: { fontSize: 12, marginTop: 2 },
  nextBtn: { backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  footer: { paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 0.5 },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  instagramRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  instagramAt: { paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontWeight: '700', borderRightWidth: 1 },
  instagramInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15, letterSpacing: 0 },
  photoStep: { alignItems: 'center', gap: 16, paddingTop: 12 },
  photoPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 12 },
  photoPrimaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  photoSecondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  photoSecondaryBtnText: { fontSize: 15, fontWeight: '600' },
});