import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useBookingStore, useInvoiceStore, useInvoiceReminderStore } from './store';

// ─── Invoice reminders (LOCAL, monthly) ───────────────────────────────────────
// For each venue where the artist has a completed gig, schedule a local
// notification on that venue's reminder day-of-month (default 1st) nudging them
// to send the invoice — UNLESS an invoice for that venue was already sent this
// month. Mirrors lib/reminders.ts: one-off DATE notifications, re-armed on app
// open (and after a reminder-day change / invoice send) so monthly repetition
// stays robust across iOS + Android. No server, works offline.

// Tag attached to every invoice reminder we schedule, so we cancel ONLY ours.
const INVOICE_REMINDER_KIND = 'invoice_reminder';

// Hour of day (local) the reminder fires on the reminder day.
const FIRE_HOUR = 10; // 10:00 AM local

// iOS caps pending local notifications (~64); the gig reminders share that
// budget, so keep invoice reminders modest.
const MAX_SCHEDULED = 20;

// ─── Next occurrence of a given day-of-month, at FIRE_HOUR local ───────────────
// If that day/time is still in the future this month, use this month; otherwise
// roll to next month. Clamps to the last day of the target month (e.g. day 30 in
// February becomes the 28th/29th) — though the picker is capped at 28 anyway.
function nextReminderDate(day: number): Date {
  const now = new Date();
  const clampDay = (year: number, monthIndex: number, d: number) => {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(d, lastDay);
  };

  const y = now.getFullYear();
  const m = now.getMonth();
  const thisMonth = new Date(y, m, clampDay(y, m, day), FIRE_HOUR, 0, 0, 0);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;

  // Otherwise next month.
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  return new Date(ny, nm, clampDay(ny, nm, day), FIRE_HOUR, 0, 0, 0);
}

// ─── Cancel only our previously-scheduled invoice reminders ────────────────────

async function cancelExistingInvoiceReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(
      (n) => (n.content?.data as any)?.kind === INVOICE_REMINDER_KIND,
    );
    await Promise.all(
      ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // ignore — best effort
  }
}

// ─── Main entry: reschedule all invoice reminders for an artist ────────────────
// Safe to call repeatedly (sign-in, app open, reminder-day change, invoice send).
// Cancels our old reminders first, then schedules fresh ones. No-ops on web.
export async function rescheduleInvoiceReminders(artistId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!artistId) return;

  try {
    await cancelExistingInvoiceReminders();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const bookings = useBookingStore.getState().bookings;
    const invoices = useInvoiceStore.getState().invoices;
    const reminderState = useInvoiceReminderStore.getState();

    // Venues with at least one completed gig for this artist.
    const completed = bookings.filter(
      (b) => b.artistId === artistId && b.isCompleted && b.status === 'completed',
    );
    const venueIds = [...new Set(completed.map((b) => b.venueId))];

    type Candidate = { fireAt: Date; venueName: string };
    const candidates: Candidate[] = [];

    for (const vid of venueIds) {
      // Skip venues already invoiced THIS month — nothing to nudge.
      const sentThisMonth = invoices.some((inv) => {
        const d = new Date(inv.sentAt);
        return inv.venueId === vid && inv.artistId === artistId &&
          d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      if (sentThisMonth) continue;

      const day = reminderState.getReminder(vid, artistId); // default 1
      const fireAt = nextReminderDate(day);

      // Venue name from the booking snapshot (artist app may not hold the venue).
      const venueName =
        completed.find((b) => b.venueId === vid)?.venueName || 'a venue';

      candidates.push({ fireAt, venueName });
    }

    // Soonest first, capped under the iOS pending limit.
    candidates.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    const toSchedule = candidates.slice(0, MAX_SCHEDULED);

    await Promise.all(
      toSchedule.map((c) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Invoice Reminder',
            body: `Time to send your invoice for ${c.venueName}`,
            data: { kind: INVOICE_REMINDER_KIND },
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
    console.warn('rescheduleInvoiceReminders error:', e);
  }
}
