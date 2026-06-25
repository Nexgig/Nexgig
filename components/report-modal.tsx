import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useAuthStore } from '@/lib/store';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reportedType: 'artist' | 'venue';
  reportedId: string;
  reportedName?: string;
}

const REASONS: { value: string; label: string }[] = [
  { value: 'fake', label: 'Fake or impersonation' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
];

export function ReportModal({ visible, onClose, reportedType, reportedId, reportedName }: ReportModalProps) {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setReason(null);
    setDetails('');
    setSubmitting(false);
    setDone(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || !currentUser?.id || submitting) return;
    setSubmitting(true);
    const selected = REASONS.find((r) => r.value === reason);
    // Email the report to admin (same mechanism as Send Feedback: opens the user's
    // mail app pre-filled). Fire-and-forget — a failure must not block confirmation.
    const typeLabel = reportedType === 'artist' ? 'Artist' : 'Venue';
    const mailSubject = `[Report] ${typeLabel}: ${reportedName ?? reportedId}`;
    const mailBody =
      `Report type: ${typeLabel}\n` +
      `Reported ${reportedType}: ${reportedName ?? '(unnamed)'} (id: ${reportedId})\n` +
      `Reason: ${selected?.label ?? reason}\n` +
      `Details: ${details.trim() || '(none)'}\n` +
      `Reporter id: ${currentUser.id}`;
    try {
      await Linking.openURL(
        `mailto:admin@nexgigapp.com?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
      );
    } catch {
      /* ignore — still show confirmation so the user isn't blocked */
    }
    setSubmitting(false);
    setDone(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {done ? (
            <>
              <View style={[styles.iconWrap, { backgroundColor: '#22C55E18' }]}>
                <MaterialIcons name="check-circle" size={28} color="#22C55E" />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>Report submitted</Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                Thank you. Our team will review this report and take action if needed.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.fullBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleClose}
              >
                <Text style={styles.fullBtnText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={[styles.iconWrap, { backgroundColor: '#EF444418' }]}>
                <MaterialIcons name="flag" size={26} color="#EF4444" />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Report {reportedType === 'artist' ? 'Artist' : 'Venue'}
              </Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                {reportedName ? `Tell us what's wrong with "${reportedName}".` : 'Tell us what\u2019s wrong.'} Your report is confidential.
              </Text>

              <View style={styles.reasons}>
                {REASONS.map((r) => {
                  const active = reason === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      style={({ pressed }) => [
                        styles.reasonRow,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + '12' : colors.background,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                      onPress={() => setReason(r.value)}
                    >
                      <MaterialIcons
                        name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={active ? colors.primary : colors.muted}
                      />
                      <Text style={[styles.reasonText, { color: colors.foreground }]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={details}
                onChangeText={setDetails}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!submitting}
              />

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  onPress={handleClose}
                  disabled={submitting}
                >
                  <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.submitBtn, { backgroundColor: reason ? '#EF4444' : colors.border, opacity: pressed && reason ? 0.85 : 1 }]}
                  onPress={handleSubmit}
                  disabled={!reason || submitting}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[styles.submitText, { color: reason ? '#fff' : colors.muted }]}>Submit</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 24, gap: 12, alignItems: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  reasons: { width: '100%', gap: 8, marginTop: 4 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  reasonText: { fontSize: 14, fontWeight: '600' },
  input: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 70 },
  actions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
  submitBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '700' },
  fullBtn: { width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  fullBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
