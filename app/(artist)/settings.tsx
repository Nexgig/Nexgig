import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch, Alert, Linking } from '@/lib/rn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useThemeContext } from '@/lib/theme-provider';
import { useAuthStore, useLineupStore } from '@/lib/store';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { REMINDER_PRESETS, getReminderOffsets, setReminderOffsets, rescheduleArtistReminders } from '@/lib/reminders';
import * as Notifications from 'expo-notifications'; // TEMP: reminder debug button

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW = 'nexgig:dj:defaultCalendarView';
export const DJ_STORAGE_KEY_APPEARANCE = 'nexgig:appearance'; // shared with manager
export const DJ_STORAGE_KEY_NOTIF_BOOKING_REQUESTS = 'nexgig:dj:notif:bookingRequests';
export const DJ_STORAGE_KEY_NOTIF_BOOKING_UPDATES = 'nexgig:dj:notif:bookingUpdates';
export const DJ_STORAGE_KEY_NOTIF_LINEUP_VENUES = 'nexgig:dj:notif:lineupVenues';
export const DJ_STORAGE_KEY_EMAIL_PRODUCT_UPDATES = 'nexgig:dj:emailProductUpdates';
export const DJ_STORAGE_KEY_LANGUAGE = 'nexgig:dj:language';
export const DJ_STORAGE_KEY_FEEDBACK = 'nexgig:dj:feedback';

export type CalendarViewMode = 'month' | 'week' | 'today';
export type AppearanceMode = 'system' | 'light' | 'dark';
export type LanguageOption = 'en' | 'ar' | 'fr';

const LANGUAGE_LABELS: Record<LanguageOption, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
};

export default function DJSettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { setColorScheme } = useThemeContext();
  const currentUserId = useAuthStore((s) => s.currentUser?.id);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [defaultCalendarView, setDefaultCalendarView] = useState<CalendarViewMode>('month');
  const [appearance, setAppearance] = useState<AppearanceMode>('system');
  const [notifBookingRequests, setNotifBookingRequests] = useState(true);
  const [notifBookingUpdates, setNotifBookingUpdates] = useState(true);
  const [notifLineupVenues, setNotifLineupVenues] = useState(true);
  const [emailProductUpdates, setEmailProductUpdates] = useState(true);
  const [reminderOffsets, setReminderOffsetsState] = useState<number[]>([]);
  const [language, setLanguage] = useState<LanguageOption>('en');
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ─── Load persisted settings ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [dcv, app, nbr, nbu, nlv, epu, lang] = await Promise.all([
          AsyncStorage.getItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW),
          AsyncStorage.getItem(DJ_STORAGE_KEY_APPEARANCE),
          AsyncStorage.getItem(DJ_STORAGE_KEY_NOTIF_BOOKING_REQUESTS),
          AsyncStorage.getItem(DJ_STORAGE_KEY_NOTIF_BOOKING_UPDATES),
          AsyncStorage.getItem(DJ_STORAGE_KEY_NOTIF_LINEUP_VENUES),
          AsyncStorage.getItem(DJ_STORAGE_KEY_EMAIL_PRODUCT_UPDATES),
          AsyncStorage.getItem(DJ_STORAGE_KEY_LANGUAGE),
        ]);
        if (dcv !== null) setDefaultCalendarView(dcv === 'week' ? 'week' : dcv === 'today' ? 'today' : 'month');
        if (app !== null) setAppearance(app as AppearanceMode);
        if (nbr !== null) setNotifBookingRequests(nbr === 'true');
        if (nbu !== null) setNotifBookingUpdates(nbu === 'true');
        if (nlv !== null) setNotifLineupVenues(nlv === 'true');
        if (epu !== null) setEmailProductUpdates(epu === 'true');
        if (lang !== null) setLanguage(lang as LanguageOption);
        // Reminder offsets come from the reminders module (its own storage key + default).
        setReminderOffsetsState(await getReminderOffsets());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Persist helpers ───────────────────────────────────────────────────────
  const saveDefaultCalendarView = useCallback(async (view: CalendarViewMode) => {
    setDefaultCalendarView(view);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW, view);
  }, []);

  const saveAppearance = useCallback(async (mode: AppearanceMode) => {
    setAppearance(mode);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_APPEARANCE, mode);
    if (mode === 'light') setColorScheme('light');
    else if (mode === 'dark') setColorScheme('dark');
  }, [setColorScheme]);

  const saveNotifBookingRequests = useCallback(async (val: boolean) => {
    setNotifBookingRequests(val);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_NOTIF_BOOKING_REQUESTS, String(val));
  }, []);

  const saveNotifBookingUpdates = useCallback(async (val: boolean) => {
    setNotifBookingUpdates(val);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_NOTIF_BOOKING_UPDATES, String(val));
  }, []);

  const saveNotifLineupVenues = useCallback(async (val: boolean) => {
    setNotifLineupVenues(val);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_NOTIF_LINEUP_VENUES, String(val));
  }, []);

  const saveEmailProductUpdates = useCallback(async (val: boolean) => {
    setEmailProductUpdates(val);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_EMAIL_PRODUCT_UPDATES, String(val));
  }, []);

  const saveReminderOffset = useCallback(async (minutes: number) => {
    setReminderOffsetsState((prev) => {
      const next = prev.includes(minutes)
        ? prev.filter((m) => m !== minutes)
        : [...prev, minutes].sort((a, b) => a - b);
      // Persist + reschedule off the new value (state update is async).
      setReminderOffsets(next);
      if (currentUserId) rescheduleArtistReminders(currentUserId);
      return next;
    });
  }, [currentUserId]);

  const saveLanguage = useCallback(async (lang: LanguageOption) => {
    setLanguage(lang);
    await AsyncStorage.setItem(DJ_STORAGE_KEY_LANGUAGE, lang);
  }, []);

  const handleResetAll = () => {
    Alert.alert(
      'Reset Settings',
      'This will restore all settings to their defaults. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              AsyncStorage.removeItem(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_APPEARANCE),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_NOTIF_BOOKING_REQUESTS),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_NOTIF_BOOKING_UPDATES),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_NOTIF_LINEUP_VENUES),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_EMAIL_PRODUCT_UPDATES),
              AsyncStorage.removeItem(DJ_STORAGE_KEY_LANGUAGE),
            ]);
            setDefaultCalendarView('month');
            setAppearance('system');
            setNotifBookingRequests(true);
            setNotifBookingUpdates(true);
            setNotifLineupVenues(true);
            setEmailProductUpdates(true);
            // Reset reminders to the default offsets (3h + 1 day) + reschedule.
            const defaults = [180, 1440];
            setReminderOffsetsState(defaults);
            await setReminderOffsets(defaults);
            if (currentUserId) rescheduleArtistReminders(currentUserId);
            setLanguage('en');
            setColorScheme('light');
          },
        },
      ]
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }} />
  );

  const calendarViews: { label: string; value: CalendarViewMode }[] = [
    { label: 'Monthly', value: 'month' },
    { label: 'Weekly', value: 'week' },
    { label: 'Today', value: 'today' },
  ];

  const appearanceModes: { label: string; value: AppearanceMode; icon: string }[] = [
    { label: 'System', value: 'system', icon: 'brightness-auto' },
    { label: 'Light', value: 'light', icon: 'light-mode' },
    { label: 'Dark', value: 'dark', icon: 'dark-mode' },
  ];

  const languages: { label: string; value: LanguageOption }[] = [
    { label: 'English', value: 'en' },
    { label: 'العربية', value: 'ar' },
    { label: 'Français', value: 'fr' },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Account ───────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/(artist)/edit-profile')}
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="person" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Edit Profile</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Update your name, bio, etc.</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <UsernameRow colors={colors} />
        </View>

        {/* ── Appearance ────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="palette" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Theme</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>
                  {appearance === 'system' ? 'Follows your device setting' : appearance === 'light' ? 'Always light mode' : 'Always dark mode'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.segmentRow}>
            {appearanceModes.map((m) => (
              <Pressable
                key={m.value}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.border },
                  appearance === m.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => saveAppearance(m.value)}
              >
                <MaterialIcons
                  name={m.icon as any}
                  size={16}
                  color={appearance === m.value ? '#fff' : colors.muted}
                />
                <Text style={[
                  styles.segmentText,
                  { color: appearance === m.value ? '#fff' : colors.foreground, marginTop: 3 },
                ]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Calendar ──────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>CALENDAR</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Default Calendar View</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Which view opens when you tap Calendar</Text>
              </View>
            </View>
          </View>
          <View style={styles.segmentRow}>
            {calendarViews.map((v) => (
              <Pressable
                key={v.value}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.border },
                  defaultCalendarView === v.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => saveDefaultCalendarView(v.value)}
              >
                <Text style={[
                  styles.segmentText,
                  { color: defaultCalendarView === v.value ? '#fff' : colors.foreground },
                ]}>{v.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="notifications" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Booking Requests</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>New request received &amp; request cancelled</Text>
              </View>
            </View>
            <Switch value={notifBookingRequests} onValueChange={saveNotifBookingRequests} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="event-busy" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Booking Updates</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Confirmed booking cancelled</Text>
              </View>
            </View>
            <Switch value={notifBookingUpdates} onValueChange={saveNotifBookingUpdates} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="group" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Lineup &amp; Venues</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Added / removed from lineup or venue</Text>
              </View>
            </View>
            <Switch value={notifLineupVenues} onValueChange={saveNotifLineupVenues} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Gig reminders — multi-select offset chips */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="alarm" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Gig Reminders</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Get reminded before your confirmed gigs — pick any</Text>
              </View>
            </View>
          </View>
          <View style={styles.chipWrap}>
            {REMINDER_PRESETS.map((preset) => {
              const selected = reminderOffsets.includes(preset.minutes);
              return (
                <Pressable
                  key={preset.minutes}
                  style={[
                    styles.chip,
                    { borderColor: colors.border },
                    selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => saveReminderOffset(preset.minutes)}
                >
                  <Text style={[
                    styles.chipText,
                    { color: selected ? '#fff' : colors.foreground },
                  ]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>

        </View>



           {/* ── Email Preferences ──────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>EMAIL PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="mail-outline" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Product Updates</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Receive product news and updates by email</Text>
              </View>
            </View>
            <Switch value={emailProductUpdates} onValueChange={saveEmailProductUpdates} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>
        </View>

        {/* ── Send Feedback ────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/(artist)/send-feedback' as any)}
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="feedback" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Send Feedback</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Report a bug or suggest a feature</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => Linking.openURL('https://nexgig.github.io/legal/privacy-policy.html')}
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="privacy-tip" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Privacy Policy</Text>
              </View>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.muted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => Linking.openURL('https://nexgig.github.io/legal/terms-of-service.html')}
          >
            <View style={styles.settingInfo}>
              <MaterialIcons name="description" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Terms of Service</Text>
              </View>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* ── Advanced ────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>ADVANCED</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.resetRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleResetAll}
          >
            <MaterialIcons name="refresh" size={20} color={colors.error} />
            <Text style={[styles.resetText, { color: colors.error }]}>Reset All Settings to Defaults</Text>
          </Pressable>
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>DANGER ZONE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.resetRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => setShowDeleteModal(true)}
          >
            <MaterialIcons name="delete-forever" size={20} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resetText, { color: colors.error }]}>Delete Account</Text>
              <Text style={[styles.settingDesc, { color: colors.muted }]}>Permanently delete your account and personal data</Text>
            </View>
          </Pressable>
        </View>

      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        accountType="artist"
      />

    </ScreenContainer>
  );
}

// ─── Username Row Component ──────────────────────────────────────────────────
function UsernameRow({ colors }: { colors: ReturnType<typeof import('@/hooks/use-colors').useColors> }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const isUsernameTaken = useLineupStore((s) => s.isUsernameTaken);
  const updateArtistUser = useLineupStore((s) => s.updateArtistUser);

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) { setError('Username is required.'); return; }
    if (!/^[a-z0-9_]+$/.test(trimmed)) { setError('Only lowercase letters, numbers, and underscores.'); return; }
    if (isUsernameTaken(trimmed, currentUser?.id)) { setError('This username is already taken.'); return; }
    updateProfile({ username: trimmed });
    if (currentUser) updateArtistUser(currentUser.id, { username: trimmed });
    setError('');
    setEditing(false);
    Alert.alert('Username Updated', `Your username is now @${trimmed}`);
  };

  if (!editing) {
    return (
      <Pressable
        style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
        onPress={() => setEditing(true)}
      >
        <View style={styles.settingInfo}>
          <MaterialIcons name="alternate-email" size={20} color={colors.primary} />
          <View style={styles.settingText}>
            <Text style={[styles.settingTitle, { color: colors.foreground }]}>Username</Text>
            <Text style={[styles.settingDesc, { color: colors.muted }]}>{currentUser?.username ? `@${currentUser.username}` : 'Not set — tap to add'}</Text>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MaterialIcons name="alternate-email" size={20} color={colors.primary} />
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>Username</Text>
      </View>
      <TextInput
        style={[styles.usernameInput, { backgroundColor: colors.background, borderColor: error ? '#EF4444' : colors.border, color: colors.foreground }]}
        value={username}
        onChangeText={(v) => { setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(''); }}
        placeholder="your_username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
      {error ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => { setEditing(false); setUsername(currentUser?.username ?? ''); setError(''); }}>
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSave}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  headerSaveBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerSaveBtnText: { fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, gap: 8, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginBottom: 4, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  settingInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  settingText: { flex: 1, gap: 2 },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingDesc: { fontSize: 12, lineHeight: 17 },
  divider: { height: 0.5, marginHorizontal: 16 },
  segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '700' },
  segmentBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  segmentText: { fontSize: 13, fontWeight: '700' },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  resetText: { fontSize: 15, fontWeight: '600' },
  usernameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
