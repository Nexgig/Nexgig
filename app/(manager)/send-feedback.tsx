import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY_FEEDBACK = 'nexgig:mgr:feedback';

type FeedbackCategory = 'bug' | 'feature' | 'general';

const CATEGORIES: { value: FeedbackCategory; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: 'bug-report' },
  { value: 'feature', label: 'Feature Request', icon: 'lightbulb' },
  { value: 'general', label: 'General Feedback', icon: 'chat' },
];

export default function SendFeedbackScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = useCallback(async () => {
    if (!message.trim()) {
      Alert.alert('Required', 'Please enter a message before sending.');
      return;
    }
    setIsSending(true);
    const entry = {
      subject: subject.trim(),
      message: message.trim(),
      category,
      sentAt: new Date().toISOString(),
    };
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEY_FEEDBACK);
      const list = existing ? JSON.parse(existing) : [];
      list.push(entry);
      await AsyncStorage.setItem(STORAGE_KEY_FEEDBACK, JSON.stringify(list));
    } catch { /* ignore */ }
    setIsSending(false);
    setSuccess(true);
  }, [subject, message, category]);

  if (success) {
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Pressable onPress={() => router.back()} style={styles.successBack}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.successContent}>
            <View style={[styles.successIconCircle, { backgroundColor: '#22C55E18' }]}>
              <MaterialIcons name="check-circle" size={64} color="#22C55E" />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Thank you!</Text>
            <Text style={[styles.successSubtitle, { color: colors.muted }]}>
              Your feedback has been received. We appreciate you taking the time to help us improve.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.doneBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.back()}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 48 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.title, { color: colors.foreground }]}>Send Feedback</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Report a bug, suggest a feature, or share your thoughts.
            </Text>
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => {
                const active = category === cat.value;
                return (
                  <Pressable
                    key={cat.value}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '18' : colors.surface,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <MaterialIcons
                      name={cat.icon as any}
                      size={16}
                      color={active ? colors.primary : colors.muted}
                    />
                    <Text style={[styles.categoryChipText, { color: active ? colors.primary : colors.muted }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Subject */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>Subject <Text style={{ color: colors.muted }}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Brief subject..."
              placeholderTextColor={colors.muted}
              value={subject}
              onChangeText={setSubject}
              returnKeyType="next"
            />
          </View>

          {/* Message */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>Message <Text style={[styles.required, { color: colors.error }]}>*</Text></Text>
            <TextInput
              style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Describe your feedback in detail..."
              placeholderTextColor={colors.muted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          {/* Send Button */}
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: colors.primary, opacity: pressed || isSending ? 0.8 : 1 },
            ]}
            onPress={handleSend}
            disabled={isSending}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
            <Text style={styles.sendBtnText}>{isSending ? 'Sending…' : 'Send Feedback'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start', padding: 4 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  section: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  required: { fontWeight: '700' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 22, paddingVertical: 8, paddingHorizontal: 14 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 140 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Success state
  successContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  successBack: { alignSelf: 'flex-start', padding: 4, marginBottom: 8 },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, gap: 16 },
  successIconCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  successTitle: { fontSize: 28, fontWeight: '800' },
  successSubtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 280 },
  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, marginTop: 8 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
