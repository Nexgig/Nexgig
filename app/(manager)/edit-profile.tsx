import { useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { CountryPicker } from '@/components/country-picker';

export default function EditProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [form, setForm] = useState({
    fullName: currentUser?.fullName ?? '',
    phone: currentUser?.phone ?? '',
    basedIn: currentUser?.location ?? '',
    yearsOfExperience: currentUser?.yearsOfExperience?.toString() ?? '',
    bio: currentUser?.bio ?? '',
  });

  const [photoUri, setPhotoUri] = useState<string | null>(currentUser?.profilePhotoUrl ?? null);
  const [saved, setSaved] = useState(false);

  // Track originals for unsaved-change detection
  const originalForm = useRef({
    fullName: currentUser?.fullName ?? '',
    phone: currentUser?.phone ?? '',
    basedIn: currentUser?.location ?? '',
    yearsOfExperience: currentUser?.yearsOfExperience?.toString() ?? '',
    bio: currentUser?.bio ?? '',
  });
  const originalPhoto = useRef(photoUri);

  const hasChanges = useMemo(() => {
    if (saved) return false;
    const f = originalForm.current;
    return (
      form.fullName !== f.fullName ||
      form.phone !== f.phone ||
      form.basedIn !== f.basedIn ||
      form.yearsOfExperience !== f.yearsOfExperience ||
      form.bio !== f.bio ||
      photoUri !== originalPhoto.current
    );
  }, [form, photoUri, saved]);

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Would you like to save before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Save', onPress: () => handleSave() },
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

  const handlePickPhoto = () => {
    Alert.alert('Change Profile Photo', 'Choose an option', [
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
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
            quality: 0.8,
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

  // ─── Secure Email Change ──────────────────────────────────────────────────
  const openEmailModal = () => {
    setEmailForm({ newEmail: '', confirmEmail: '', password: '' });
    setShowEmailModal(true);
  };

  const handleEmailChange = () => {
    const { newEmail, confirmEmail, password } = emailForm;

    if (!newEmail.trim()) {
      Alert.alert('Required', 'Please enter your new email address.');
      return;
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (newEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) {
      Alert.alert('Same Email', 'The new email is the same as your current email.');
      return;
    }
    if (newEmail.trim() !== confirmEmail.trim()) {
      Alert.alert('Mismatch', 'The email addresses do not match. Please re-enter to confirm.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your current password to confirm this change.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }

    // In a real app this would call an API with password verification
    // For demo, we accept any password >= 6 chars
    updateProfile({ email: newEmail.trim().toLowerCase() });
    setShowEmailModal(false);
    Alert.alert('Email Updated', `Your email has been changed to ${newEmail.trim().toLowerCase()}.`);
  };

  // ─── Secure Phone Change ──────────────────────────────────────────────────
  const openPhoneModal = () => {
    setPhoneForm({ newPhone: '', confirmPhone: '', password: '' });
    setShowPhoneModal(true);
  };

  const handlePhoneChange = () => {
    const { newPhone, confirmPhone, password } = phoneForm;

    if (!newPhone.trim()) {
      Alert.alert('Required', 'Please enter your new phone number.');
      return;
    }
    // Basic phone validation (at least 7 digits)
    const digitsOnly = newPhone.replace(/[^0-9+]/g, '');
    if (digitsOnly.replace('+', '').length < 7) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number with at least 7 digits.');
      return;
    }
    if (newPhone.trim() === currentUser?.phone) {
      Alert.alert('Same Number', 'The new phone number is the same as your current number.');
      return;
    }
    if (newPhone.trim() !== confirmPhone.trim()) {
      Alert.alert('Mismatch', 'The phone numbers do not match. Please re-enter to confirm.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your current password to confirm this change.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }

    // In a real app this would call an API with password verification + SMS OTP
    updateProfile({ phone: newPhone.trim() });
    setShowPhoneModal(false);
    setForm((f) => ({ ...f, phone: newPhone.trim() }));
    Alert.alert('Phone Updated', `Your phone number has been changed to ${newPhone.trim()}.`);
  };

  const handleSave = () => {
    if (!form.fullName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    updateProfile({
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      location: form.basedIn || undefined,
      yearsOfExperience: form.yearsOfExperience ? parseInt(form.yearsOfExperience, 10) : undefined,
      bio: form.bio.trim() || undefined,
      profilePhotoUrl: photoUri ?? undefined,
    });

    setSaved(true);
    Alert.alert('Saved', 'Your profile has been updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
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
          onPress={handleSave}
          style={({ pressed }) => [styles.headerSaveBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.headerSaveBtnText, { color: colors.primary }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Avatar with edit overlay */}
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
          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Full Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.fullName}
              onChangeText={(v) => update('fullName', v)}
              placeholder="Your full name"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Email — Secure Edit */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Email Address</Text>
            <Pressable
              onPress={openEmailModal}
              style={({ pressed }) => [styles.secureField, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.secureFieldContent}>
                <MaterialIcons name="email" size={18} color={colors.muted} />
                <Text style={[styles.secureFieldValue, { color: colors.foreground }]} numberOfLines={1}>
                  {currentUser?.email ?? 'Not set'}
                </Text>
              </View>
              <View style={styles.secureFieldAction}>
                <MaterialIcons name="lock" size={14} color={colors.muted} />
                <Text style={[styles.secureFieldActionText, { color: colors.primary }]}>Change</Text>
              </View>
            </Pressable>
            <Text style={[styles.secureHint, { color: colors.muted }]}>
              Requires password confirmation to change
            </Text>
          </View>

          {/* Phone — Secure Edit */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Phone Number</Text>
            <Pressable
              onPress={openPhoneModal}
              style={({ pressed }) => [styles.secureField, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.secureFieldContent}>
                <MaterialIcons name="phone" size={18} color={colors.muted} />
                <Text style={[styles.secureFieldValue, { color: colors.foreground }]} numberOfLines={1}>
                  {currentUser?.phone || 'Not set'}
                </Text>
              </View>
              <View style={styles.secureFieldAction}>
                <MaterialIcons name="lock" size={14} color={colors.muted} />
                <Text style={[styles.secureFieldActionText, { color: colors.primary }]}>Change</Text>
              </View>
            </Pressable>
            <Text style={[styles.secureHint, { color: colors.muted }]}>
              Requires password confirmation to change
            </Text>
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

          {/* Years of Experience */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Years of Experience</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.yearsOfExperience}
              onChangeText={(v) => update('yearsOfExperience', v.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 5"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              returnKeyType="done"
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
              value={form.bio}
              onChangeText={(v) => { if (v.length <= 500) update('bio', v); }}
              placeholder="Tell artists and venues about yourself..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

        </View>
      </ScrollView>

      {/* ═══════════════════ EMAIL CHANGE MODAL ═══════════════════ */}
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
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                  Current: {currentUser?.email}
                </Text>
              </View>
            </View>

            <View style={[styles.securityNotice, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <MaterialIcons name="security" size={16} color={colors.warning} />
              <Text style={[styles.securityNoticeText, { color: '#92400E' }]}>
                For your security, you must confirm the new email and enter your password.
              </Text>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>New Email Address</Text>
                <TextInput
                  style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Enter new email"
                  placeholderTextColor={colors.muted}
                  value={emailForm.newEmail}
                  onChangeText={(v) => setEmailForm((f) => ({ ...f, newEmail: v }))}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>Confirm New Email</Text>
                <TextInput
                  style={[
                    styles.modalFieldInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                    emailForm.confirmEmail.length > 0 && emailForm.confirmEmail !== emailForm.newEmail && { borderColor: colors.error },
                  ]}
                  placeholder="Re-enter new email"
                  placeholderTextColor={colors.muted}
                  value={emailForm.confirmEmail}
                  onChangeText={(v) => setEmailForm((f) => ({ ...f, confirmEmail: v }))}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
                {emailForm.confirmEmail.length > 0 && emailForm.confirmEmail !== emailForm.newEmail && (
                  <Text style={styles.mismatchText}>Emails do not match</Text>
                )}
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>Current Password</Text>
                <TextInput
                  style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.muted}
                  value={emailForm.password}
                  onChangeText={(v) => setEmailForm((f) => ({ ...f, password: v }))}
                  secureTextEntry
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                onPress={() => setShowEmailModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.9 : 1 }]}
                onPress={handleEmailChange}
              >
                <MaterialIcons name="lock" size={16} color="#fff" />
                <Text style={styles.modalConfirmText}>Update Email</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════ PHONE CHANGE MODAL ═══════════════════ */}
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
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                  Current: {currentUser?.phone || 'Not set'}
                </Text>
              </View>
            </View>

            <View style={[styles.securityNotice, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <MaterialIcons name="security" size={16} color={colors.warning} />
              <Text style={[styles.securityNoticeText, { color: '#92400E' }]}>
                For your security, you must confirm the new number and enter your password.
              </Text>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>New Phone Number</Text>
                <TextInput
                  style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="+971 XX XXX XXXX"
                  placeholderTextColor={colors.muted}
                  value={phoneForm.newPhone}
                  onChangeText={(v) => setPhoneForm((f) => ({ ...f, newPhone: v }))}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>Confirm New Phone Number</Text>
                <TextInput
                  style={[
                    styles.modalFieldInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground },
                    phoneForm.confirmPhone.length > 0 && phoneForm.confirmPhone !== phoneForm.newPhone && { borderColor: colors.error },
                  ]}
                  placeholder="Re-enter new phone number"
                  placeholderTextColor={colors.muted}
                  value={phoneForm.confirmPhone}
                  onChangeText={(v) => setPhoneForm((f) => ({ ...f, confirmPhone: v }))}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
                {phoneForm.confirmPhone.length > 0 && phoneForm.confirmPhone !== phoneForm.newPhone && (
                  <Text style={styles.mismatchText}>Phone numbers do not match</Text>
                )}
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>Current Password</Text>
                <TextInput
                  style={[styles.modalFieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.muted}
                  value={phoneForm.password}
                  onChangeText={(v) => setPhoneForm((f) => ({ ...f, password: v }))}
                  secureTextEntry
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                onPress={() => setShowPhoneModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.9 : 1 }]}
                onPress={handlePhoneChange}
              >
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerSaveBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerSaveBtnText: { fontSize: 16, fontWeight: '700' },
  backBtn: { padding: 2 },
  title: { fontSize: 18, fontWeight: '800' },
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatarWrapper: { position: 'relative' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  changePhotoText: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  emailLabel: { fontSize: 14 },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCount: { fontSize: 12 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  bioInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 120,
  },
  // Secure field row
  secureField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secureFieldContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  secureFieldValue: { fontSize: 16, flex: 1 },
  secureFieldAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secureFieldActionText: { fontSize: 14, fontWeight: '700' },
  secureHint: { fontSize: 11, marginTop: -2, paddingLeft: 2 },
  // City chips
  cityChipsContainer: { gap: 8, paddingVertical: 4 },
  cityChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cityChipText: { fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  modalIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, marginTop: 2 },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  securityNoticeText: { fontSize: 13, lineHeight: 18, flex: 1 },
  modalForm: { gap: 16, marginBottom: 24 },
  modalFieldGroup: { gap: 6 },
  modalFieldLabel: { fontSize: 13, fontWeight: '700' },
  modalFieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  mismatchText: { color: '#EF4444', fontSize: 12, fontWeight: '600', marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
