import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBookingStore } from './store';

// ─── Reminder offset presets ──────────────────────────────────────────────────
// Each artist picks any combination of these. Stored as an array of minute
// offsets BEFORE the gig start time.
export interface ReminderPreset {
  label: string;
  minutes: number;
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '1 day', minutes: 1440 },
];

const STORAGE_KEY_REMINDER_OFFSETS = 'nexgig:dj:reminderOffsets';

// Default to 3 hours + 1 day, matching the old two-toggle defaults.
const DEFAULT_OFFSETS = [180, 1440];

// Tag we attach to every reminder we schedule, so we can find + cancel only
// OUR reminders (never touching other scheduled notifications).
const REMINDER_KIND = 'gig_reminder';

// iOS caps pending local notifications (~64). Stay safely under it.
const MAX_SCHEDULED = 60;

// ─── Persisted offsets ────────────────────────────────────────────────────────

export async function getReminderOffsets(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_REMINDER_OFFSETS);
    if (raw === null) return [...DEFAULT_OFFSETS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_OFFSETS];
    // Keep only known preset values, sorted ascending.
    const valid = REMINDER_PRESETS.map((p) => p.minutes);
    return parsed.filter((n) => typeof n === 'number' && valid.includes(n)).sort((a, b) => a - b);
  } catch {
    return [...DEFAULT_OFFSETS];
  }
}

export async function setReminderOffsets(offsets: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_REMINDER_OFFSETS, JSON.stringify(offsets));
  } catch {
    // ignore write failure — non-critical
  }
}

// ─── Notification body helpers: "today/tomorrow at 9 PM" ───────────────────────

// "today" if the gig lands on the same calendar day the reminder fires, else
// "tomorrow" (our max offset is 24h, so it's only ever one of those two).
function dayWord(fireAt: Date, gigStart: Date): string {
  const f = new Date(fireAt.getFullYear(), fireAt.getMonth(), fireAt.getDate());
  const g = new Date(gigStart.getFullYear(), gigStart.getMonth(), gigStart.getDate());
  const diffDays = Math.round((g.getTime() - f.getTime()) / 86400000);
  return diffDays >= 1 ? 'tomorrow' : 'today';
}

// "9 PM" / "8:30 PM" from a local Date (drops :00 on the hour).
function formatGigTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Build the gig start Date from a booking's snapshot fields (slotDate + slotStartTime).
// The artist app doesn't load slots, so these snapshots are the source of truth.
function gigStartDate(slotDate?: string, slotStartTime?: string): Date | null {
  if (!slotDate) return null;
  const time = slotStartTime && /^\d{2}:\d{2}/.test(slotStartTime) ? slotStartTime.slice(0, 5) : '00:00';
  // Local time (device tz). Format: YYYY-MM-DDTHH:MM:00
  const dt = new Date(`${slotDate}T${time}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

// ─── Cancel only our previously-scheduled gig reminders ────────────────────────

async function cancelExistingReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(
      (n) => (n.content?.data as any)?.kind === REMINDER_KIND,
    );
    await Promise.all(
      ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // ignore — best effort
  }
}

// ─── Main entry: reschedule all gig reminders for an artist ─────────────────────
// Safe to call repeatedly (sign-in, settings change). Cancels our old reminders
// first, then schedules fresh ones from the artist's current confirmed gigs +
// selected offsets. No-ops on web.
export async function rescheduleArtistReminders(artistId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!artistId) return;

  try {
    // Always clear our old ones first (covers cancelled gigs, changed settings).
    await cancelExistingReminders();

    const offsets = await getReminderOffsets();
    if (offsets.length === 0) return; // nothing selected → all cancelled, done.

    // Only confirmed gigs, in the future, with a usable start datetime.
    const confirmed = useBookingStore.getState().getConfirmedBookingsByDJ(artistId);
    const now = Date.now();

    type Candidate = { fireAt: Date; venueName: string; start: Date };
    const candidates: Candidate[] = [];

    for (const b of confirmed) {
      const start = gigStartDate(b.slotDate, b.slotStartTime);
      if (!start) continue;
      const venueName = b.venueName || 'your gig';
      for (const off of offsets) {
        const fireAt = new Date(start.getTime() - off * 60 * 1000);
        if (fireAt.getTime() <= now) continue; // already passed → skip
        candidates.push({ fireAt, venueName, start });
      }
    }

    // Soonest first, capped under the iOS pending limit.
    candidates.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    const toSchedule = candidates.slice(0, MAX_SCHEDULED);

    await Promise.all(
      toSchedule.map((c) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Upcoming Gig',
            body: `${c.venueName} ${dayWord(c.fireAt, c.start)} at ${formatGigTime(c.start)}`,
            data: { kind: REMINDER_KIND },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: c.fireAt,
          },
        }),
      ),
    );
  } catch (e) {
    console.warn('rescheduleArtistReminders error:', e);
  }
}
