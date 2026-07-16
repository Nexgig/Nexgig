import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, Alert, Linking } from '@/lib/rn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useThemeContext } from '@/lib/theme-provider';
import { useTimeFormatStore, type TimeFormat } from '@/lib/conflict-detection';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { reportError, reportWarning, getObservabilityStatus } from '@/lib/observability';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const STORAGE_KEY_MONTH_START_DAY = 'nexgig:monthStartDay';
export const STORAGE_KEY_SHOW_HIDDEN_VENUES = 'nexgig:showHiddenVenues';
export const STORAGE_KEY_DEFAULT_CALENDAR_VIEW = 'nexgig:defaultCalendarView';
export const STORAGE_KEY_SHOW_LINEUP_BALANCE = 'nexgig:showLineupBalance';
export const STORAGE_KEY_APPEARANCE = 'nexgig:appearance';
export const STORAGE_KEY_EMAIL_MARKETING = 'nexgig:emailMarketing';
export const STORAGE_KEY_WEEKLY_DIGEST = 'nexgig:weeklyDigest';
export const STORAGE_KEY_LINEUP_STATUSES = 'nexgig:lineupStatuses';
export const STORAGE_KEY_NOTIF_ARTIST_RESPONSES = 'nexgig:mgr:notif:artistResponses';
export const STORAGE_KEY_NOTIF_NEW_ARTIST = 'nexgig:mgr:notif:newArtist';
export const STORAGE_KEY_FEEDBACK = 'nexgig:mgr:feedback';

export type CalendarViewMode = 'month' | 'week' | 'today';
export type AppearanceMode = 'system' | 'light' | 'dark';
// Which booking statuses count toward the Lineup Balance gig tally.
// 'all' is a convenience alias meaning all four are selected.
export type LineupStatusFilter = 'draft' | 'requested' | 'confirmed' | 'completed';
export const LINEUP_STATUS_DEFAULT: LineupStatusFilter[] = ['draft', 'requested', 'confirmed', 'completed'];

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  // Theme mode lives in the ThemeProvider (single source of truth). 'system' there
  // follows the live OS theme, so switching to System applies the device theme now.
  const { appearance, setAppearance } = useThemeContext();
  const timeFormat = useTimeFormatStore((s) => s.format);
  const setTimeFormat = useTimeFormatStore((s) => s.setFormat);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [showLineupBalance, setShowLineupBalance] = useState(true);
  const [defaultCalendarView, setDefaultCalendarView] = useState<CalendarViewMode>('month');
  const [emailMarketing, setEmailMarketing] = useState(true);
  const [lineupStatuses, setLineupStatuses] = useState<LineupStatusFilter[]>(LINEUP_STATUS_DEFAULT);
  const [notifArtistResponses, setNotifArtistResponses] = useState(true);
  const [notifNewArtist, setNotifNewArtist] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ─── Load persisted settings ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [msd, slb, dcv, em, ls, nar, nna] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_MONTH_START_DAY),
          AsyncStorage.getItem(STORAGE_KEY_SHOW_LINEUP_BALANCE),
          AsyncStorage.getItem(STORAGE_KEY_DEFAULT_CALENDAR_VIEW),
          AsyncStorage.getItem(STORAGE_KEY_EMAIL_MARKETING),
          AsyncStorage.getItem(STORAGE_KEY_LINEUP_STATUSES),
          AsyncStorage.getItem(STORAGE_KEY_NOTIF_ARTIST_RESPONSES),
          AsyncStorage.getItem(STORAGE_KEY_NOTIF_NEW_ARTIST),
        ]);
        if (msd !== null) setMonthStartDay(Number(msd));
        if (slb !== null) setShowLineupBalance(slb !== 'false');
        if (dcv !== null) {
          // Map legacy 'venue'/'all' values to new 'month'
          const mapped = (dcv === 'week') ? 'week' : 'month';
          setDefaultCalendarView(mapped as CalendarViewMode);
        }
        if (em !== null) setEmailMarketing(em === 'true');
        if (ls !== null) {
          try {
            const parsed = JSON.parse(ls) as LineupStatusFilter[];
            if (Array.isArray(parsed) && parsed.length > 0) setLineupStatuses(parsed);
          } catch { /* ignore corrupt data */ }
        }
        if (nar !== null) setNotifArtistResponses(nar === 'true');
        if (nna !== null) setNotifNewArtist(nna === 'true');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Persist helpers ───────────────────────────────────────────────────────
  const saveMonthStartDay = useCallback(async (day: number) => {
    setMonthStartDay(day);
    await AsyncStorage.setItem(STORAGE_KEY_MONTH_START_DAY, String(day));
  }, []);

  const saveShowLineupBalance = useCallback(async (val: boolean) => {
    setShowLineupBalance(val);
    await AsyncStorage.setItem(STORAGE_KEY_SHOW_LINEUP_BALANCE, String(val));
  }, []);

  const saveDefaultCalendarView = useCallback(async (view: CalendarViewMode) => {
    setDefaultCalendarView(view);
    await AsyncStorage.setItem(STORAGE_KEY_DEFAULT_CALENDAR_VIEW, view);
  }, []);

  const saveEmailMarketing = useCallback(async (val: boolean) => {
    setEmailMarketing(val);
    await AsyncStorage.setItem(STORAGE_KEY_EMAIL_MARKETING, String(val));
  }, []);

  const saveNotifArtistResponses = useCallback(async (val: boolean) => {
    setNotifArtistResponses(val);
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_ARTIST_RESPONSES, String(val));
  }, []);

  const saveNotifNewArtist = useCallback(async (val: boolean) => {
    setNotifNewArtist(val);
    await AsyncStorage.setItem(STORAGE_KEY_NOTIF_NEW_ARTIST, String(val));
  }, []);

  const toggleLineupStatus = useCallback(async (status: LineupStatusFilter) => {
    setLineupStatuses((prev) => {
      let next: LineupStatusFilter[];
      if (prev.includes(status)) {
        // Don't allow deselecting the last one
        if (prev.length === 1) return prev;
        next = prev.filter((s) => s !== status);
      } else {
        next = [...prev, status];
      }
      AsyncStorage.setItem(STORAGE_KEY_LINEUP_STATUSES, JSON.stringify(next));
      return next;
    });
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
              AsyncStorage.removeItem(STORAGE_KEY_MONTH_START_DAY),
              AsyncStorage.removeItem(STORAGE_KEY_SHOW_HIDDEN_VENUES),
              AsyncStorage.removeItem(STORAGE_KEY_DEFAULT_CALENDAR_VIEW),
              AsyncStorage.removeItem(STORAGE_KEY_APPEARANCE),
              AsyncStorage.removeItem(STORAGE_KEY_EMAIL_MARKETING),
              AsyncStorage.removeItem(STORAGE_KEY_LINEUP_STATUSES),
              AsyncStorage.removeItem(STORAGE_KEY_NOTIF_ARTIST_RESPONSES),
              AsyncStorage.removeItem(STORAGE_KEY_NOTIF_NEW_ARTIST),
            ]);
            setMonthStartDay(1);
            setShowLineupBalance(true);
            setDefaultCalendarView('month');
            setAppearance('system');
            setEmailMarketing(true);
            setLineupStatuses(LINEUP_STATUS_DEFAULT);
            setNotifArtistResponses(true);
            setNotifNewArtist(true);
          },
        },
      ]
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }} />
  );

  const calendarViews: { label: string; value: CalendarViewMode; icon: string }[] = [
    { label: 'Month', value: 'month', icon: 'calendar-month' },
    { label: 'Week', value: 'week', icon: 'view-week' },
    { label: 'Today', value: 'today', icon: 'today' },
  ];

  const appearanceModes: { label: string; value: AppearanceMode; icon: string }[] = [
    { label: 'System', value: 'system', icon: 'brightness-auto' },
    { label: 'Light', value: 'light', icon: 'light-mode' },
    { label: 'Dark', value: 'dark', icon: 'dark-mode' },
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
            onPress={() => router.push('/(manager)/edit-profile')}
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
                onPress={() => setAppearance(m.value)}
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

          {/* Default View */}
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

        {/* ── Lineup Balance ────────────────────────────────────────────────── */}
        {/* Time Format */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>TIME FORMAT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="schedule" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Clock Format</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>How times show across the app</Text>
              </View>
            </View>
          </View>
          <View style={styles.segmentRow}>
            {([
              { label: '24-hour', value: '24h' as TimeFormat, hint: '21:00' },
              { label: '12-hour', value: '12h' as TimeFormat, hint: '9:00 PM' },
            ]).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.border },
                  timeFormat === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setTimeFormat(opt.value)}
              >
                <Text style={[
                  styles.segmentText,
                  { color: timeFormat === opt.value ? '#fff' : colors.foreground },
                ]}>{opt.label}</Text>
                <Text style={[
                  styles.segmentText,
                  { color: timeFormat === opt.value ? '#fff' : colors.muted, fontWeight: '500', fontSize: 11, marginTop: 2 },
                ]}>{opt.hint}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>LINEUP BALANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="equalizer" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Show Lineup Balance Panel</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Display the artist booking count panel on the Calendar screen</Text>
              </View>
            </View>
            <Switch
              value={showLineupBalance}
              onValueChange={saveShowLineupBalance}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Count criteria */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="filter-list" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Count Criteria</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Which booking statuses count toward each artist's gig tally</Text>
              </View>
            </View>
          </View>
          <View style={styles.segmentRow}>
            {(['draft', 'requested', 'confirmed', 'completed'] as LineupStatusFilter[]).map((status) => {
              const active = lineupStatuses.includes(status);
              const label = status.charAt(0).toUpperCase() + status.slice(1);
              return (
                <Pressable
                  key={status}
                  style={[
                    styles.segmentBtn,
                    { borderColor: colors.border },
                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleLineupStatus(status)}
                >
                  <Text style={[
                    styles.segmentText,
                    { color: active ? '#fff' : colors.foreground },
                  ]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Month Start Day */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Month Starts on Day</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>
                  {monthStartDay === 1
                    ? 'Standard: 1st – last day of month'
                    : `Custom: ${monthStartDay}th of prev month – ${monthStartDay - 1}th of current`}
                </Text>
              </View>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayPickerRow}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <Pressable
                key={day}
                style={[
                  styles.dayBtn,
                  { borderColor: colors.border },
                  monthStartDay === day && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => saveMonthStartDay(day)}
              >
                <Text style={[
                  styles.dayBtnText,
                  { color: monthStartDay === day ? '#fff' : colors.foreground },
                ]}>{day}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="reply" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Artist Responses</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Confirms, declines, or cancels a booking</Text>
              </View>
            </View>
            <Switch value={notifArtistResponses} onValueChange={saveNotifArtistResponses} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="person-add" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>New Artist Joined</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Artist added to lineup</Text>
              </View>
            </View>
            <Switch value={notifNewArtist} onValueChange={saveNotifNewArtist} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>

        </View>

        {/* ── Marketing Preferences ────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>EMAIL PREFERENCES</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {/* Product Updates */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="mail-outline" size={20} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Product Updates</Text>
                <Text style={[styles.settingDesc, { color: colors.muted }]}>Receive product news and updates by email</Text>
              </View>
            </View>
            <Switch
              value={emailMarketing}
              onValueChange={saveEmailMarketing}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── Send Feedback ─────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.navRow, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/(manager)/send-feedback' as any)}
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

        {/* ── About ─────────────────────────────────────────── */}
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

        {/* ── Advanced ── */}
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
              <Text style={[styles.settingDesc, { color: colors.muted }]}>Permanently delete your account; venues will be deactivated</Text>
            </View>
          </Pressable>
        </View>

        {/* Version footer. TEMP: long-press fires a Sentry smoke-test (a warning +
            a caught exception — does NOT crash the app). Remove the onLongPress
            before public release; the version label itself can stay. */}
        <Pressable
          delayLongPress={800}
          onLongPress={() => {
            const s = getObservabilityStatus();
            reportWarning('sentry-smoke-test: warning from settings long-press', { at: 'manager-settings' });
            try {
              throw new Error('Sentry smoke-test: manual test from manager settings long-press');
            } catch (e) {
              reportError(e, { at: 'manager-settings', intentional: true });
            }
            Alert.alert(
              'Sentry diagnostics',
              `SDK in build: ${s.sdkPresent ? 'YES' : 'NO'}\n` +
              `DSN present: ${s.dsnSet ? 'YES' : 'NO'}\n` +
              `Initialized: ${s.initialized ? 'YES' : 'NO'}\n` +
              `Dev mode: ${s.dev ? 'YES (won\'t send)' : 'no'}\n\n` +
              (s.sdkPresent
                ? 'Test event sent — check the Sentry dashboard.'
                : 'Sentry SDK is NOT in this build. Install a fresh native build via TestFlight (OTA can\'t add it).'),
            );
          }}
        >
          <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12, paddingVertical: 24 }}>
            Nexgig v1.0.0
          </Text>
        </Pressable>

      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        accountType="manager"
      />

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerSaveBtnText: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800' },
  scroll: { padding: 20, gap: 8, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginBottom: 4, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  settingInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  settingText: { flex: 1, gap: 2 },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingDesc: { fontSize: 12, lineHeight: 17 },
  divider: { height: 0.5, marginHorizontal: 16 },
  segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  segmentBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  dayPickerRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  dayBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 13, fontWeight: '700' },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  resetText: { fontSize: 15, fontWeight: '600' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 13, fontWeight: '700' },
});
