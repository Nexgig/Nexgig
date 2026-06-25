import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { sendAdminEmail } from '@/lib/send-email';

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
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [reason, setReason] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setReason(null);
    setReasonOpen(false);
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
    const reasonLabel = selected?.label ?? reason;
    // 1. Save the report to Supabase (best-effort).
    try {
      await supabase.from('reports').insert({
        reporter_id: currentUser.id,
        reported_type: reportedType,
        reported_id: reportedId,
        reason: reasonLabel,
        details: details.trim() || null,
      });
    } catch {
      /* best-effort; still notify + confirm so the user isn't blocked */
    }
    // 2. Email the report to admin server-side (no mail-app popup).
    sendAdminEmail('report_admin', {
      reportedType,
      reportedId,
      reportedName: reportedName ?? null,
      reason: reasonLabel,
      details: details.trim() || null,
      reporterId: currentUser.id,
    });
    setSubmitting(false);
    setDone(true);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {done ? 'Report submitted' : `Report ${reportedType === 'artist' ? 'Artist' : 'Venue'}`}
          </Text>
          <Pressable onPress={handleClose} hitSlop={8} disabled={submitting} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {done ? (
            <View style={styles.doneWrap}>
              <View style={[styles.iconWrap, { backgroundColor: '#22C55E18' }]}>
                <MaterialIcons name="check-circle" size={40} color="#22C55E" />
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
            </View>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: 24 + keyboardHeight }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={[styles.iconWrap, { backgroundColor: '#EF444418', alignSelf: 'center' }]}>
                  <MaterialIcons name="flag" size={28} color="#EF4444" />
                </View>
                <Text style={[styles.body, { color: colors.muted, textAlign: 'center', marginBottom: 8 }]}>
                  {reportedName ? `Tell us what's wrong with "${reportedName}".` : 'Tell us what’s wrong.'} Your report is confidential.
                </Text>

                {/* Reason — dropdown (collapses so the details body sits higher) */}
                <View style={{ zIndex: 10 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Reason</Text>
                  {(() => {
                    const selected = REASONS.find((r) => r.value === reason);
                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.dropdownField,
                          { backgroundColor: colors.surface, borderColor: reasonOpen ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 },
                        ]}
                        onPress={() => setReasonOpen((o) => !o)}
                        disabled={submitting}
                      >
                        <Text style={[styles.dropdownFieldText, { color: selected ? colors.foreground : colors.muted }]}>
                          {selected ? selected.label : 'Select a reason'}
                        </Text>
                        <MaterialIcons name={reasonOpen ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
                      </Pressable>
                    );
                  })()}
                  {reasonOpen && (
                    <View style={[styles.dropdownMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {REASONS.map((r) => {
                        const active = reason === r.value;
                        return (
                          <Pressable
                            key={r.value}
                            style={({ pressed }) => [styles.dropdownItem, { backgroundColor: pressed ? colors.primary + '12' : 'transparent' }]}
                            onPress={() => { setReason(r.value); setReasonOpen(false); }}
                          >
                            <Text style={[styles.dropdownItemText, { color: active ? colors.primary : colors.foreground, fontWeight: active ? '700' : '500' }]}>
                              {r.label}
                            </Text>
                            {active && <MaterialIcons name="check" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Add details (optional)"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!submitting}
                />
              </ScrollView>

              {/* Fixed footer actions */}
              <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
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
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 20, gap: 12 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  reasons: { width: '100%', gap: 8, marginTop: 4 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 },
  reasonText: { fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  dropdownField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dropdownFieldText: { flex: 1, fontSize: 15, fontWeight: '600' },
  dropdownMenu: { position: 'absolute', top: '100%', left: 0, right: 0, borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden', zIndex: 20, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  dropdownItemText: { fontSize: 15 },
  input: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 100, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 0.5 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
  submitBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '700' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  fullBtn: { width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  fullBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
