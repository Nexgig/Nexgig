import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, KeyboardAvoidingView, Platform } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { AvatarPreviewModal } from '@/components/ui/avatar-preview-modal';
import { AvatarPicker } from '@/components/ui/avatar-picker';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { uploadImageAsync, pickImage, type PickSource } from '@/lib/upload';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { CountryPicker } from '@/components/country-picker';
import { PhoneInput } from '@/components/phone-input';

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
    companyName: currentUser?.companyName ?? '',
  });

  const [photoUri, setPhotoUri] = useState<string | null>(currentUser?.profilePhotoUrl ?? null);
  const [avatarId, setAvatarId] = useState<string | null>(currentUser?.avatarId ?? null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track originals for unsaved-change detection. These are STATE (not refs) so that
  // resetting them after a successful save re-runs the hasChanges memo and clears the guard.
  const [originalForm, setOriginalForm] = useState({
    fullName: currentUser?.fullName ?? '',
    phone: currentUser?.phone ?? '',
    basedIn: currentUser?.location ?? '',
    companyName: currentUser?.companyName ?? '',
  });
  const [originalPhoto, setOriginalPhoto] = useState(photoUri);
  const [originalAvatar, setOriginalAvatar] = useState(avatarId);

  const hasChanges = useMemo(() => {
    const f = originalForm;
    return (
      form.fullName !== f.fullName ||
      form.phone !== f.phone ||
      form.basedIn !== f.basedIn ||
      form.companyName !== f.companyName ||
      photoUri !== originalPhoto ||
      avatarId !== originalAvatar
    );
  }, [form, photoUri, avatarId, originalForm, originalPhoto, originalAvatar]);

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
  const [emailForm, setEmailForm] = useState({ newEmail: '', confirmEmail: '' });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ newPhone: '' });
  // Round-preview confirm step: freshly-cropped uri awaiting user approval.
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<PickSource>('library');

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handlePickPhoto = () => {
    Alert.alert('Change Profile Photo', 'Choose an option', [
      {
        text: 'Choose from Library',
        onPress: async () => {
          const uri = await pickImage({ source: 'library' });
          if (uri) { setPendingSource('library'); setPendingPhoto(uri); }
        },
      },
      {
        text: 'Take Photo',
        onPress: async () => {
          const uri = await pickImage({ source: 'camera' });
          if (uri) { setPendingSource('camera'); setPendingPhoto(uri); }
        },
      },
      {
        text: 'Choose an Avatar',
        onPress: () => setShowAvatarPicker(true),
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
    setEmailForm({ newEmail: '', confirmEmail: '' });
    setShowEmailModal(true);
  };

  const handleEmailChange = () => {
    const { newEmail, confirmEmail } = emailForm;

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

    updateProfile({ email: newEmail.trim().toLowerCase() });
    setShowEmailModal(false);
    Alert.alert('Email Updated', `Your email has been changed to ${newEmail.trim().toLowerCase()}.`);
  };

  // ─── Secure Phone Change ──────────────────────────────────────────────────
  const openPhoneModal = () => {
    setPhoneForm({ newPhone: '' });
    setShowPhoneModal(true);
  };

  const handlePhoneChange = async () => {
    const { newPhone } = phoneForm;

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
    if (!currentUser) return;

    // Persist immediately to the managers row (the source sign-in re-hydrates from).
    const { data, error } = await supabase
      .from('managers')
      .update({ phone: newPhone.trim() })
      .eq('id', currentUser.id)
      .select();
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Update failed', 'Your phone number was not saved (0 rows updated). This usually means a missing row-level-security UPDATE policy on the managers table.');
      return;
    }

    // Reflect locally + keep the form baseline in sync so the back-guard won't fire.
    updateProfile({ phone: newPhone.trim() });
    setForm((f) => ({ ...f, phone: newPhone.trim() }));
    setOriginalForm((o) => ({ ...o, phone: newPhone.trim() }));
    setShowPhoneModal(false);
    Alert.alert('Phone Updated', `Your phone number has been changed to ${newPhone.trim()}.`);
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
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
      phone: form.phone.trim(),
      location: form.basedIn || undefined,
      companyName: form.companyName.trim() || undefined,
      profilePhotoUrl: photoUrl,
      avatarId: avatarId ?? undefined,
    });

    // Persist every editable manager field to Supabase. The managers row is the source
    // of truth that sign-in re-hydrates from, so all fields are written there; the photo
    // is also written to the users row so any surface reading from users stays in sync.
    if (currentUser) {
      const { error: usersErr } = await supabase
        .from('users')
        .update({ profile_photo_url: photoUrl ?? null })
        .eq('id', currentUser.id);

      const { data: managerRows, error: managersErr } = await supabase
        .from('managers')
        .update({
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          based_in: form.basedIn || null,
          company_name: form.companyName.trim() || null,
          profile_photo_url: photoUrl ?? null,
          avatar_id: avatarId ?? null,
        })
        .eq('id', currentUser.id)
        .select();

      const writeErr = managersErr ?? usersErr;
      if (writeErr) {
        setSaving(false);
        Alert.alert('Save failed', writeErr.message);
        return;
      }
      // PostgREST does NOT error when RLS blocks an UPDATE — it just updates 0 rows.
      // Catch that here so a missing UPDATE policy can't fail silently.
      if (!managerRows || managerRows.length === 0) {
        setSaving(false);
        Alert.alert('Save failed', 'Your changes were not written to the database (0 rows updated). This is almost always a missing row-level-security UPDATE policy on the managers table.');
        return;
      }
    }

    // Reset the change baseline (as state, so the hasChanges memo recomputes to false and
    // the back-guard won't fire), and reflect the uploaded photo URL.
    setOriginalForm({ ...form });
    setOriginalPhoto(photoUrl ?? null);
    setOriginalAvatar(avatarId);
    setPhotoUri(photoUrl ?? null);
    setSaving(false);
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
          disabled={saving}
          style={({ pressed }) => [styles.headerSaveBtn, { opacity: pressed || saving ? 0.7 : 1 }]}
        >
          <Text style={[styles.headerSaveBtnText, { color: colors.primary }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Avatar with edit overlay */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickPhoto} style={({ pressed }) => [styles.avatarWrapper, { opacity: pressed ? 0.8 : 1 }]}>
            <AvatarImage uri={photoUri ?? undefined} avatarId={avatarId ?? undefined} seed={currentUser?.id} name={currentUser?.fullName} size={90} variant="manager" />
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
            <View style={[styles.secureField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.secureFieldContent}>
                <MaterialIcons name="email" size={18} color={colors.muted} />
                <Text style={[styles.secureFieldValue, { color: colors.foreground }]} numberOfLines={1}>
                  {currentUser?.email ?? 'Not set'}
                </Text>
              </View>
              <MaterialIcons name="lock-outline" size={16} color={colors.muted} />
            </View>
            <Text style={[styles.secureHint, { color: colors.muted }]}>
              To change your email, email admin@nexgigapp.com.
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
                <MaterialIcons name="edit" size={14} color={colors.primary} />
                <Text style={[styles.secureFieldActionText, { color: colors.primary }]}>Change</Text>
              </View>
            </Pressable>
            <Text style={[styles.secureHint, { color: colors.muted }]}>
              Tap to change
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

          {/* Company Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Company Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={form.companyName}
              onChangeText={(v) => update('companyName', v)}
              placeholder="The company you work for"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>


        </View>
      </ScrollView>

      {/* ═══════════════════ EMAIL CHANGE MODAL ═══════════════════ */}
      <Modal visible={showEmailModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmailModal(false)}>
        <View style={[styles.modalFull, { backgroundColor: colors.background }]}>
          <View style={[styles.modalFullHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change Email</Text>
            <Pressable onPress={() => setShowEmailModal(false)} hitSlop={8}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.modalFullBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalSubtitle, { color: colors.muted }]}>Current: {currentUser?.email ?? 'Not set'}</Text>

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
                  returnKeyType="done"
                />
                {emailForm.confirmEmail.length > 0 && emailForm.confirmEmail !== emailForm.newEmail && (
                  <Text style={styles.mismatchText}>Emails do not match</Text>
                )}
              </View>
            </ScrollView>
            <View style={[styles.modalFullFooter, { borderTopColor: colors.border }]}>
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
                <Text style={styles.modalConfirmText}>Update Email</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ═══════════════════ PHONE CHANGE MODAL ═══════════════════ */}
      <Modal visible={showPhoneModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPhoneModal(false)}>
        <View style={[styles.modalFull, { backgroundColor: colors.background }]}>
          <View style={[styles.modalFullHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Change Phone Number</Text>
            <Pressable onPress={() => setShowPhoneModal(false)} hitSlop={8}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.modalFullBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalSubtitle, { color: colors.muted }]}>Current: {currentUser?.phone || 'Not set'}</Text>
              <PhoneInput
                label="New Phone Number"
                optional={false}
                value={phoneForm.newPhone}
                onChange={(v) => setPhoneForm({ newPhone: v })}
              />
            </ScrollView>
            <View style={[styles.modalFullFooter, { borderTopColor: colors.border }]}>
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
                <Text style={styles.modalConfirmText}>Update Phone</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <AvatarPreviewModal
        uri={pendingPhoto}
        onConfirm={() => { if (pendingPhoto) setPhotoUri(pendingPhoto); setPendingPhoto(null); }}
        onRetry={async () => {
          const uri = await pickImage({ source: pendingSource });
          setPendingPhoto(uri ?? null);
        }}
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
    backgroundColor: '#E2674A',
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
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
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
    backgroundColor: '#E2674A',
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
    backgroundColor: '#E2674A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalFull: { flex: 1 },
  modalFullHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  modalFullBody: { padding: 20, gap: 18, flexGrow: 1 },
  modalFullFooter: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 0.5 },
});
