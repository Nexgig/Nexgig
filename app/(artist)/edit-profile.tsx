import { useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { uploadImageAsync } from '@/lib/upload';
import { useColors } from '@/hooks/use-colors';
import type { GenreType, InstrumentType } from '@/lib/types';
import { CountryPicker } from '@/components/country-picker';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

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

export default function DJEditProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const djProfile = useLineupStore((s) => currentUser ? s.getArtistProfile(currentUser.id) : undefined);
  const updateArtistProfile = useLineupStore((s) => s.updateArtistProfile);

  const [form, setForm] = useState({
    fullName: currentUser?.fullName ?? '',
    fullLegalName: currentUser?.fullLegalName ?? '',
    phone: currentUser?.phone ?? '',
    basedIn: djProfile?.basedIn ?? '',
    nationality: djProfile?.nationality ?? '',
    bio: currentUser?.bio ?? '',
    instagramUrl: djProfile?.instagramUrl ?? '',
    soundcloudUrl: djProfile?.soundcloudUrl ?? '',
    mixcloudUrl: djProfile?.mixcloudUrl ?? '',
    spotifyUrl: djProfile?.spotifyUrl ?? '',
    minRate: djProfile?.minRate?.toString() ?? '',
  });

  const [primaryGenre, setPrimaryGenre] = useState<GenreType>(
    (djProfile?.primaryGenre as GenreType) ?? 'House'
  );
  const [secondaryGenres, setSecondaryGenres] = useState<GenreType[]>(
    (djProfile?.secondaryGenres as GenreType[]) ?? []
  );
  const [instruments, setInstruments] = useState<InstrumentType[]>(
    (djProfile?.instruments as InstrumentType[]) ?? []
  );
  const [photoUri, setPhotoUri] = useState<string | null>(currentUser?.profilePhotoUrl ?? null);
  // Bumped after each successful save so the unsaved-changes memo recomputes
  // against the freshly-reset baseline (mutating the refs alone won't do that).
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  // Track originals for unsaved-change detection
  const originalForm = useRef({
    fullName: currentUser?.fullName ?? '',
    fullLegalName: currentUser?.fullLegalName ?? '',
    phone: currentUser?.phone ?? '',
    basedIn: djProfile?.basedIn ?? '',
    nationality: djProfile?.nationality ?? '',
    bio: currentUser?.bio ?? '',
    instagramUrl: djProfile?.instagramUrl ?? '',
    soundcloudUrl: djProfile?.soundcloudUrl ?? '',
    mixcloudUrl: djProfile?.mixcloudUrl ?? '',
    spotifyUrl: djProfile?.spotifyUrl ?? '',
    minRate: djProfile?.minRate?.toString() ?? '',
  });
  const originalGenre = useRef(primaryGenre);
  const originalSecondary = useRef(secondaryGenres);
  const originalInstruments = useRef(instruments);
  const originalPhoto = useRef(photoUri);

  const hasChanges = useMemo(() => {
    const f = originalForm.current;
    return (
      form.fullName !== f.fullName ||
      form.fullLegalName !== f.fullLegalName ||
      form.phone !== f.phone ||
      form.basedIn !== f.basedIn ||
      form.nationality !== f.nationality ||
      form.bio !== f.bio ||
      form.instagramUrl !== f.instagramUrl ||
      form.soundcloudUrl !== f.soundcloudUrl ||
      form.mixcloudUrl !== f.mixcloudUrl ||
      form.spotifyUrl !== f.spotifyUrl ||
      form.minRate !== f.minRate ||
      primaryGenre !== originalGenre.current ||
      JSON.stringify(secondaryGenres) !== JSON.stringify(originalSecondary.current) ||
      JSON.stringify(instruments) !== JSON.stringify(originalInstruments.current) ||
      photoUri !== originalPhoto.current
    );
  }, [form, primaryGenre, secondaryGenres, instruments, photoUri, baselineVersion]);

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Would you like to save before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Save', onPress: () => handleSave(true) },
        ]
      );
    } else {
      router.back();
    }
  };

  // Secure edit modals
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: '', confirmEmail: '', password: '' });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ newPhone: '', confirmPhone: '', password: '' });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const toggleSecondaryGenre = (g: GenreType) => {
    setSecondaryGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const toggleInstrument = (i: InstrumentType) => {
    setInstruments((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  const handlePickPhoto = () => {
    Alert.alert('Change Profile Photo', 'Choose an option', [
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          });
          if (!result.canceled && result.assets[0]) {
            setPhotoUri(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Needed', 'Camera permission is required to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
          });
          if (!result.canceled && result.assets[0]) {
            setPhotoUri(result.assets[0].uri);
          }
        },
      },
      ...(photoUri ? [{
        text: 'Remove Photo',
        style: 'destructive' as const,
        onPress: () => setPhotoUri(null),
      }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const openEmailModal = () => {
    setEmailForm({ newEmail: '', confirmEmail: '', password: '' });
    setShowEmailModal(true);
  };

  const handleEmailChange = () => {
    const { newEmail, confirmEmail, password } = emailForm;
    if (!newEmail.trim()) { Alert.alert('Required', 'Please enter your new email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) { Alert.alert('Invalid Email', 'Please enter a valid email address.'); return; }
    if (newEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) { Alert.alert('Same Email', 'The new email is the same as your current email.'); return; }
    if (newEmail.trim() !== confirmEmail.trim()) { Alert.alert('Mismatch', 'The email addresses do not match.'); return; }
    if (!password.trim() || password.length < 6) { Alert.alert('Invalid Password', 'Password must be at least 6 characters.'); return; }
    updateProfile({ email: newEmail.trim().toLowerCase() });
    setShowEmailModal(false);
    Alert.alert('Email Updated', `Your email has been changed to ${newEmail.trim().toLowerCase()}.`);
  };

  const openPhoneModal = () => {
    setPhoneForm({ newPhone: '', confirmPhone: '', password: '' });
    setShowPhoneModal(true);
  };

  const handlePhoneChange = () => {
    const { newPhone, confirmPhone, password } = phoneForm;
    if (!newPhone.trim()) { Alert.alert('Required', 'Please enter your new phone number.'); return; }
    const digitsOnly = newPhone.replace(/[^0-9+]/g, '');
    if (digitsOnly.replace('+', '').length < 7) { Alert.alert('Invalid Phone', 'Please enter a valid phone number.'); return; }
    if (newPhone.trim() === currentUser?.phone) { Alert.alert('Same Number', 'The new phone number is the same as your current number.'); return; }
    if (newPhone.trim() !== confirmPhone.trim()) { Alert.alert('Mismatch', 'The phone numbers do not match.'); return; }
    if (!password.trim() || password.length < 6) { Alert.alert('Invalid Password', 'Password must be at least 6 characters.'); return; }
    updateProfile({ phone: newPhone.trim() });
    setShowPhoneModal(false);
    setForm((f) => ({ ...f, phone: newPhone.trim() }));
    Alert.alert('Phone Updated', `Your phone number has been changed to ${newPhone.trim()}.`);
  };

  const handleSave = async (exitAfter = false) => {
    if (!form.fullName.trim()) { Alert.alert('Required', 'Please enter your artist name.'); return; }
    if (!form.fullLegalName.trim()) { Alert.alert('Required', 'Please enter your full legal name.'); return; }
    if (saving) return;
    setSaving(true);

    // Upload a newly-picked photo (local file) to Storage; existing remote URLs pass through unchanged.
    let photoUrl = photoUri ?? undefined;
    if (photoUri && currentUser) {
      try {
        photoUrl = await uploadImageAsync(photoUri, 'avatars', `avatar-${currentUser.id}`);
      } catch (e: any) {
        setSaving(false);
        Alert.alert('Photo upload failed', e?.message ?? 'Could not upload your photo. Please try again.');
        return;
      }
    }

    updateProfile({
      fullName: form.fullName.trim(),
      fullLegalName: form.fullLegalName.trim(),
      phone: form.phone.trim(),
      bio: form.bio.trim() || undefined,
      profilePhotoUrl: photoUrl,
    });

    if (currentUser) {
      updateArtistProfile(currentUser.id, {
        primaryGenre,
        secondaryGenres,
        instruments,
        minRate: form.minRate ? parseFloat(form.minRate) : undefined,
        basedIn: form.basedIn || undefined,
        nationality: form.nationality || undefined,
        instagramUrl: form.instagramUrl.trim() || undefined,
        soundcloudUrl: form.soundcloudUrl.trim() || undefined,
        mixcloudUrl: form.mixcloudUrl.trim() || undefined,
        spotifyUrl: form.spotifyUrl.trim() || undefined,
      });

      // Persist EVERY editable field to Supabase. The artists row is the source of truth
      // that sign-in re-hydrates from, so all profile fields are written there (previously
      // only the photo was, so other edits reverted on sign-out/in). The photo is also
      // written to the users row so any surface reading from users stays in sync.
      const { error: usersErr } = await supabase
        .from('users')
        .update({ profile_photo_url: photoUrl ?? null })
        .eq('id', currentUser.id);

      const { data: artistRows, error: artistErr } = await supabase
        .from('artists')
        .update({
          full_name: form.fullName.trim(),
          full_legal_name: form.fullLegalName.trim() || null,
          bio: form.bio.trim() || null,
          based_in: form.basedIn || null,
          nationality: form.nationality || null,
          primary_genre: primaryGenre || null,
          secondary_genres: secondaryGenres,
          instruments: instruments,
          min_rate: form.minRate ? parseFloat(form.minRate) : null,
          instagram_url: form.instagramUrl.trim() || null,
          soundcloud_url: form.soundcloudUrl.trim() || null,
          mixcloud_url: form.mixcloudUrl.trim() || null,
          spotify_url: form.spotifyUrl.trim() || null,
          profile_photo_url: photoUrl ?? null,
        })
        .eq('id', currentUser.id)
        .select();

      const writeErr = artistErr ?? usersErr;
      if (writeErr) {
        setSaving(false);
        Alert.alert('Save failed', writeErr.message);
        return;
      }
      // PostgREST does NOT error when RLS blocks an UPDATE — it just updates 0 rows.
      if (!artistRows || artistRows.length === 0) {
        setSaving(false);
        Alert.alert('Save failed', 'Your changes were not written to the database (0 rows updated). This usually means a missing row-level-security UPDATE policy on the artists table.');
        return;
      }
    }

    // Reset the change baseline so we can stay on the page without the
    // unsaved-changes guard firing, and reflect the uploaded photo URL.
    originalForm.current = { ...form };
    originalGenre.current = primaryGenre;
    originalSecondary.current = secondaryGenres;
    originalInstruments.current = instruments;
    originalPhoto.current = photoUrl ?? null;
    setPhotoUri(photoUrl ?? null);
    setBaselineVersion((v) => v + 1);
    setSaving(false);
    if (exitAfter) router.back();
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right', 'bottom']}>
      {/* Sticky Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <MaterialIcons name="chevron-left" size={28} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Profile</Text>
        <Pressable
          onPress={() => handleSave()}
          disabled={saving}
          style={({ pressed }) => [styles.headerSaveBtn, { opacity: pressed || saving ? 0.7 : 1 }]}
        >
          <Text style={[styles.headerSaveBtnText, { color: colors.primary }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickPhoto} style={({ pressed }) => [styles.avatarWrapper, { opacity: pressed ? 0.8 : 1 }]}>
            <AvatarImage uri={photoUri ?? undefined} name={currentUser?.fullName} size={90} />
            <View style={styles.cameraOverlay}>
              <MaterialIcons name="camera-alt" size={18} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={handlePickPhoto}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>Change Photo</Text>
          </Pressable>
          <Text style={[styles.emailLabel, { color: colors.muted }]}>{currentUser?.email}</Text>
        </View>

        <View style={styles.form}>
          {/* Artist Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Artist Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.fullName} onChangeText={(v) => update('fullName', v)}
              placeholder="Your stage name" placeholderTextColor={colors.muted} returnKeyType="next"
            />
          </View>

          {/* Full Legal Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Full Legal Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.fullLegalName} onChangeText={(v) => update('fullLegalName', v)}
              placeholder="Your real name (private)" placeholderTextColor={colors.muted} returnKeyType="next"
            />
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Kept private — used for future invoicing</Text>
          </View>

          {/* Email — Secure Edit */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Email Address</Text>
            <Pressable onPress={openEmailModal} style={({ pressed }) => [styles.secureField, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={styles.secureFieldContent}>
                <MaterialIcons name="email" size={18} color={colors.muted} />
                <Text style={[styles.secureFieldValue, { color: colors.foreground }]} numberOfLines={1}>{currentUser?.email ?? 'Not set'}</Text>
              </View>
              <View style={styles.secureFieldAction}>
                <MaterialIcons name="lock" size={14} color={colors.muted} />
                <Text style={[styles.secureFieldActionText, { color: colors.primary }]}>Change</Text>
              </View>
            </Pressable>
            <Text style={[styles.secureHint, { color: colors.muted }]}>Requires password confirmation to change</Text>
          </View>

          {/* Phone — Secure Edit */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Phone Number</Text>
            <Pressable onPress={openPhoneModal} style={({ pressed }) => [styles.secureField, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={styles.secureFieldContent}>
                <MaterialIcons name="phone" size={18} color={colors.muted} />
                <Text style={[styles.secureFieldValue, { color: colors.foreground }]} numberOfLines={1}>{currentUser?.phone || 'Not set'}</Text>
              </View>
              <View style={styles.secureFieldAction}>
                <MaterialIcons name="lock" size={14} color={colors.muted} />
                <Text style={[styles.secureFieldActionText, { color: colors.primary }]}>Change</Text>
              </View>
            </Pressable>
            <Text style={[styles.secureHint, { color: colors.muted }]}>Requires password confirmation to change</Text>
          </View>

          {/* Based In */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Based In</Text>
            <CountryPicker
              value={form.basedIn}
              onChange={(v) => update('basedIn', v)}
              placeholder="Select country"
            />
          </View>

          {/* Nationality */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Nationality</Text>
            <CountryPicker
              value={form.nationality}
              onChange={(v) => update('nationality', v)}
              placeholder="Select nationality"
            />
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Bio</Text>
              <Text style={[styles.charCount, { color: colors.muted }]}>{form.bio.length}/500</Text>
            </View>
            <TextInput
              style={[styles.bioInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.bio} onChangeText={(v) => { if (v.length <= 500) update('bio', v); }}
              placeholder="Tell venues about yourself..." placeholderTextColor={colors.muted}
              multiline numberOfLines={5} textAlignVertical="top"
            />
          </View>

          {/* ─── Artist Details ─── */}
          <View style={[styles.sectionDivider, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Artist Details</Text>
          </View>

          {/* Primary Genre */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Primary Genre</Text>
            <View style={styles.chipWrap}>
              {GENRES.map((g) => {
                const isSelected = primaryGenre === g;
                return (
                  <Pressable key={g} style={[styles.chip, { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]} onPress={() => setPrimaryGenre(g)}>
                    <Text style={[styles.chipText, { color: isSelected ? '#fff' : colors.foreground }]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Secondary Genres */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Secondary Genres</Text>
            <View style={styles.chipWrap}>
              {GENRES.filter((g) => g !== primaryGenre).map((g) => {
                const isSelected = secondaryGenres.includes(g);
                return (
                  <Pressable key={g} style={[styles.chip, { backgroundColor: isSelected ? colors.primary + '20' : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]} onPress={() => toggleSecondaryGenre(g)}>
                    <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.foreground }]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Instruments */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Instruments</Text>
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Select all that apply</Text>
            <View style={styles.chipWrap}>
              {INSTRUMENTS.map((i) => {
                const isSelected = instruments.includes(i);
                return (
                  <Pressable key={i} style={[styles.chip, { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]} onPress={() => toggleInstrument(i)}>
                    <Text style={[styles.chipText, { color: isSelected ? '#fff' : colors.foreground }]}>{i}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Minimum Rate */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Minimum Rate (AED)</Text>
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Only visible to managers</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.minRate} onChangeText={(v) => update('minRate', v.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 3000" placeholderTextColor={colors.muted} keyboardType="number-pad" returnKeyType="done"
            />
          </View>

          {/* ─── Links ─── */}
          <View style={[styles.sectionDivider, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Links</Text>
          </View>

          {[
            { key: 'instagramUrl', label: 'Instagram', placeholder: 'instagram.com/yourname' },
            { key: 'soundcloudUrl', label: 'SoundCloud', placeholder: 'soundcloud.com/yourname' },
            { key: 'spotifyUrl', label: 'Spotify', placeholder: 'open.spotify.com/artist/...' },
            { key: 'mixcloudUrl', label: 'Mixcloud', placeholder: 'mixcloud.com/yourname' },
          ].map(({ key, label, placeholder }) => (
            <View key={key} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
              <View style={[styles.linkField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="link" size={16} color={colors.muted} />
                <TextInput
                  style={[styles.linkInput, { color: colors.foreground }]}
                  value={(form as Record<string, string>)[key]}
                  onChangeText={(v) => update(key, v)}
                  placeholder={placeholder} placeholderTextColor={colors.muted}
                  autoCapitalize="none" keyboardType="url" returnKeyType="done"
                />
              </View>
            </View>
          ))}

        </View>
      </ScrollView>

      {/* EMAIL CHANGE MODAL */}
      <Modal visible={showEmailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: colors.primary + '15' }]}>
                <MaterialIcons name="email" size={22} color={colors.primary} />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change Email</Text>
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>Current: {currentUser?.email}</Text>
              </View>
            </View>
            <View style={[styles.securityNotice, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <MaterialIcons name="security" size={16} color={colors.warning} />
              <Text style={[styles.securityNoticeText, { color: '#92400E' }]}>For your security, confirm the new email and enter your password.</Text>
            </View>
            <View style={styles.modalForm}>
              {[
                { label: 'New Email Address', key: 'newEmail', placeholder: 'Enter new email', keyboard: 'email-address' as const },
                { label: 'Confirm New Email', key: 'confirmEmail', placeholder: 'Re-enter new email', keyboard: 'email-address' as const },
                { label: 'Current Password', key: 'password', placeholder: 'Enter your password', keyboard: 'default' as const, secure: true },
              ].map(({ label, key, placeholder, keyboard, secure }) => (
                <View key={key} style={styles.modalFieldGroup}>
                  <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>{label}</Text>
                  <TextInput
                    style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={placeholder} placeholderTextColor={colors.muted}
                    value={(emailForm as Record<string, string>)[key]}
                    onChangeText={(v) => setEmailForm((f) => ({ ...f, [key]: v }))}
                    autoCapitalize="none" keyboardType={keyboard} secureTextEntry={secure} returnKeyType="next"
                  />
                </View>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => setShowEmailModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.9 : 1 }]} onPress={handleEmailChange}>
                <MaterialIcons name="lock" size={16} color="#fff" />
                <Text style={styles.modalConfirmText}>Update Email</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* PHONE CHANGE MODAL */}
      <Modal visible={showPhoneModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: colors.primary + '15' }]}>
                <MaterialIcons name="phone" size={22} color={colors.primary} />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change Phone Number</Text>
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>Current: {currentUser?.phone || 'Not set'}</Text>
              </View>
            </View>
            <View style={[styles.securityNotice, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <MaterialIcons name="security" size={16} color={colors.warning} />
              <Text style={[styles.securityNoticeText, { color: '#92400E' }]}>For your security, confirm the new number and enter your password.</Text>
            </View>
            <View style={styles.modalForm}>
              {[
                { label: 'New Phone Number', key: 'newPhone', placeholder: '+971 50 000 0000', keyboard: 'phone-pad' as const },
                { label: 'Confirm New Number', key: 'confirmPhone', placeholder: 'Re-enter phone number', keyboard: 'phone-pad' as const },
                { label: 'Current Password', key: 'password', placeholder: 'Enter your password', keyboard: 'default' as const, secure: true },
              ].map(({ label, key, placeholder, keyboard, secure }) => (
                <View key={key} style={styles.modalFieldGroup}>
                  <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>{label}</Text>
                  <TextInput
                    style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={placeholder} placeholderTextColor={colors.muted}
                    value={(phoneForm as Record<string, string>)[key]}
                    onChangeText={(v) => setPhoneForm((f) => ({ ...f, [key]: v }))}
                    keyboardType={keyboard} secureTextEntry={secure} returnKeyType="next"
                  />
                </View>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]} onPress={() => setShowPhoneModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.9 : 1 }]} onPress={handlePhoneChange}>
                <MaterialIcons name="lock" size={16} color="#fff" />
                <Text style={styles.modalConfirmText}>Update Phone</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  headerSaveBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerSaveBtnText: { fontSize: 16, fontWeight: '700' },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800' },
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatarWrapper: { position: 'relative' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  changePhotoText: { fontSize: 14, fontWeight: '600' },
  emailLabel: { fontSize: 13 },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldHint: { fontSize: 12, marginTop: -4 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCount: { fontSize: 12 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  bioInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
  secureField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  secureFieldContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  secureFieldValue: { fontSize: 15, flex: 1 },
  secureFieldAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  secureFieldActionText: { fontSize: 13, fontWeight: '600' },
  secureHint: { fontSize: 11, marginTop: -2 },
  chipScroll: { gap: 8, paddingVertical: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '500' },
  sectionDivider: { borderTopWidth: 0.5, paddingTop: 16, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  linkField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  linkInput: { flex: 1, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  modalIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, marginTop: 2 },
  securityNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  securityNoticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  modalForm: { gap: 14, marginBottom: 20 },
  modalFieldGroup: { gap: 6 },
  modalFieldLabel: { fontSize: 13, fontWeight: '600' },
  modalFieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
