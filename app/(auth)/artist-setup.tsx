import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { EmailOtpModal } from '@/components/email-otp-modal';
import { useColors } from '@/hooks/use-colors';
import type { GenreType, InstrumentType } from '@/lib/types';
import { CountryPicker } from '@/components/country-picker';
import { PhoneInput } from '@/components/phone-input';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/send-email';
import { markWhatsNewSeen } from '@/lib/whats-new';
import { AvatarImage } from '@/components/ui/avatar-image';
import { AvatarPicker } from '@/components/ui/avatar-picker';
import { defaultAvatarId } from '@/lib/avatars';
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
  // Apple/Google already handed us the user's real name — App Store Guideline 4 (Sign in with
  // Apple) forbids RE-ASKING for a name/email the provider supplies. When we have it, pre-fill
  // BOTH the (public) artist name and the legal name from it, and hide the legal-name field so
  // the user is never required to type a name after Sign in with Apple. It stays editable in
  // Edit Profile. `resume` (email/password user finishing setup) is NOT this case — they still
  // enter their own name. Only when the provider actually gave a name do we hide/pre-fill.
  const isOAuth = oauth === '1';
  const oauthGaveName = isOAuth && !!(oauthName && oauthName.trim());

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [form, setForm] = useState({
    fullName: oauthName ?? '',
    fullLegalName: oauthGaveName ? (oauthName ?? '') : '',
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
  const [showOtp, setShowOtp] = useState(false);
  // Profile photo / avatar (optional, chosen on the Profile Photo step).
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  // The signed-in user's id, captured as soon as a session exists (signUp at step 1, OTP
  // verify, or an OAuth/resume session already present on mount). The avatar step's default
  // preview is seeded by THIS id so it matches the id-seeded default the profile renders
  // later — otherwise the auto-avatar shown at signup differs from the one on the profile,
  // which reads as "my avatar changed after signup".
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user?.id) setAuthUserId(data.user.id); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) setAuthUserId(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

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
      // OAuth (Apple/Google): never REQUIRE a name. Apple only returns it on the first-ever
      // sign-in, so blocking on it would re-trigger Guideline 4 for a returning reviewer. It's
      // pre-filled when available and editable later in Edit Profile.
      if (!isOAuth && !form.fullName.trim()) { Alert.alert('Required', 'Please enter your display name.'); return; }
      if (!isOAuth && !form.fullLegalName.trim()) { Alert.alert('Required', 'Please enter your full legal name.'); return; }
      if (!hasSession) {
        const emailErr = validateEmail(form.email);
        if (emailErr) { setEmailError(emailErr); return; }
        setEmailError('');
        if (!form.password.trim() || form.password.length < 6) { Alert.alert('Required', 'Password must be at least 6 characters.'); return; }
      }
      if (form.instruments.length === 0) { Alert.alert('Required', 'Please select at least one or more instrument.'); return; }

      // Create the account here, not at the end. Same as the manager flow: the
      // "email already taken" error surfaces now, before three steps of typing.
      // Abandoning mid-signup is recoverable — sign-in resumes an unfinished setup
      // using the account_type stamped on the auth user below.
      if (!hasSession) {
        setIsLoading(true);
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
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
        setIsLoading(false);
        // Anti-enumeration: with Confirm-email + enumeration protection ON, signing up with
        // an ALREADY-registered email returns NO error and an obfuscated user with
        // identities: [] (and no session). Catch that so we don't strand them in the code
        // modal waiting for a code that was never sent.
        if (signUpData.user && (signUpData.user.identities?.length ?? 0) === 0) {
          setEmailError('That email is already registered. Try signing in instead.');
          return;
        }
        // Adaptive so the OTA is safe whether or not email confirmation is on:
        //   confirmation ON  → signUp returns NO session → verify the emailed code first
        //                      (the modal's onVerified advances to step 2).
        //   confirmation OFF → signUp auto-confirms + returns a session → just continue.
        if (!signUpData.session) {
          setShowOtp(true);
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

    if (!form.instagram.trim()) {
      Alert.alert('Required', 'Please add your Instagram handle.');
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

    // Never store a blank artist name: it's optional for OAuth and Apple only sends a name on
    // the first-ever sign-in. Fall back to the email's local part (editable in Edit Profile).
    const resolvedName = form.fullName.trim() || (profileEmail.split('@')[0] || 'Artist');

    // ✅ Step 2 — insert into users table
    const { error: userInsertError } = await supabase.from('users').upsert({
  id: user.id,
  email: profileEmail,
  full_name: resolvedName,
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
    const baseUsername = resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'artist';
    let username = baseUsername;
    for (let n = 2; n <= 60; n++) {
      const { data: taken } = await supabase.from('artists').select('id').eq('username', username).maybeSingle();
      if (!taken) break;
      username = `${baseUsername}${n}`;
    }

    // Avatar only — no photo upload anywhere in the app.
    const photoUrl: string | null = null;
    // Always persist a CONCRETE avatar: an explicit pick, or the deterministic default
    // seeded by the user id (the same seed every display screen uses). Never leave it null —
    // a null makes each screen recompute its own default, and those can differ (the bug that
    // made a freshly-picked avatar look like it "changed" on the profile).
    const resolvedAvatarId = avatarId ?? defaultAvatarId(user.id);

    // ✅ Step 3 — insert into artists table (retry username on a unique clash / race)
    const artistRow = {
      id: user.id,
      email: profileEmail,
      full_name: resolvedName,
      full_legal_name: form.fullLegalName.trim(),
      phone: form.phone.trim(),
      bio: form.bio || null,
      based_in: form.basedIn || null,
      nationality: form.nationality || null,
      primary_genre: form.primaryGenre || null,
      secondary_genres: form.secondaryGenres,
      instruments: form.instruments,
      profile_photo_url: photoUrl,
      avatar_id: resolvedAvatarId,
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
      fullName: resolvedName,
      fullLegalName: form.fullLegalName.trim(),
      username,
      bio: form.bio,
      location: undefined,
      profilePhotoUrl: photoUrl ?? undefined,
      avatarId: resolvedAvatarId,
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

    // Claim any pending roster invites for this email — a manager who invited this
    // person BEFORE they signed up. The server-side RPC adds them to that manager's
    // roster + the picked venues; we then notify the manager(s). Fire-and-forget and
    // fully guarded: a failure here (incl. the RPC not being deployed yet) can NEVER
    // block signup.
    void (async () => {
      try {
        const { data: claimed } = await supabase.rpc('claim_roster_invites');
        if (!Array.isArray(claimed) || claimed.length === 0) return;
        const addNotification = useNotificationStore.getState().addNotification;
        const nowIso = new Date().toISOString();
        for (const c of claimed as { out_manager_id?: string; out_manager_name?: string }[]) {
          if (!c?.out_manager_id) continue;
          // Notify the MANAGER — their invited artist joined.
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: c.out_manager_id,
            type: 'artist_joined' as any,
            title: 'Artist joined your roster',
            body: `${resolvedName || 'An artist'} accepted your invite and joined your roster`,
            isRead: false,
            relatedId: user.id,
            relatedType: 'artist',
            createdAt: nowIso,
          });
          // Notify the NEW ARTIST too — so they see they're on this manager's roster (same
          // as when a manager adds an already-registered artist).
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}-a`,
            userId: user.id,
            type: 'lineup_added' as any,
            title: 'Added to Roster',
            body: `${c.out_manager_name || 'A manager'} added you to their roster — you can now be booked at their venues`,
            isRead: false,
            relatedId: c.out_manager_id,
            relatedType: 'manager',
            createdAt: nowIso,
          });
        }
      } catch (err) {
        console.warn('[claim_roster_invites] failed:', err);
      }
    })();

    await AsyncStorage.setItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW, 'month');
    // Brand-new account → mark the current "What's New" as seen so it doesn't pop on first sign-in.
    await markWhatsNewSeen('artist');
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
                <Text style={[styles.label, { color: colors.foreground }]}>Display Name{isOAuth ? '' : ' *'}</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Your stage name — shown publicly</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="DJ Kai" placeholderTextColor={colors.muted}
                  value={form.fullName} onChangeText={(v) => update('fullName', v)} returnKeyType="next" />
              </View>
              {/* Hidden for Apple/Google signups (Guideline 4 — don't re-ask for the real
                  name). Pre-filled from the provider when available, editable in Edit Profile. */}
              {!isOAuth && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Full Legal Name *</Text>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>Kept private, used for invoicing</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Kai Nakamura" placeholderTextColor={colors.muted}
                  value={form.fullLegalName} onChangeText={(v) => update('fullLegalName', v)} returnKeyType="next" />
              </View>
              )}
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
                    <Pressable key={g} style={[styles.chip, { borderColor: form.primaryGenre === g ? colors.primary : colors.border, backgroundColor: form.primaryGenre === g ? colors.primary : 'transparent' }]} onPress={() => setForm((prev) => ({ ...prev, primaryGenre: g, secondaryGenres: prev.secondaryGenres.filter((x) => x !== g) }))}>
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
              <View style={styles.photoStep}>
                <AvatarImage avatarId={avatarId ?? undefined} seed={authUserId ?? form.fullName} name={form.fullName} size={120} />
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
                <Text style={[styles.label, { color: colors.foreground }]}>Instagram *</Text>
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

      <AvatarPicker
        visible={showAvatarPicker}
        selectedId={avatarId}
        onSelect={(id) => { setAvatarId(id); setShowAvatarPicker(false); }}
        onClose={() => setShowAvatarPicker(false)}
      />

      <EmailOtpModal
        visible={showOtp}
        email={form.email.trim().toLowerCase()}
        onVerified={() => { setShowOtp(false); animateToStep(2, 'forward'); }}
        onCancel={() => setShowOtp(false)}
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
  photoSecondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  photoSecondaryBtnText: { fontSize: 15, fontWeight: '600' },
});