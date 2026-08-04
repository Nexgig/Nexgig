import { supabase } from '@/lib/supabase';
import { useAuthStore, useVenueStore, useSlotStore, useBookingStore, useDraftStore } from '@/lib/store';
import { todayLocalStr, addDaysStr } from '@/lib/utils';
import { toMondayIndex, setsForDay } from '@/lib/venue-schedule';
import type { Slot } from '@/lib/types';

// A slot's natural key — a schedule night is uniquely a venue + date + start + end.
const slotKey = (venueId: string, date: string, start: string, end: string) => `${venueId}|${date}|${start}|${end}`;

const weekdayOf = (date: string) => toMondayIndex(new Date(date + 'T00:00:00').getDay());

// Keys currently being inserted, so a second call (rapid re-render / two screens) can't
// race and double-insert the same night before the store catches up.
const inflight = new Set<string>();

/**
 * Materialize-on-view: for every managed venue with a programme, create the real Slot rows
 * for each date in [fromStr, toStr] that matches one of its sets and doesn't already exist.
 * Idempotent — only missing nights are inserted. Safe to call on every calendar/month view.
 */
export async function ensureScheduleSlots(fromStr: string, toStr: string): Promise<void> {
  const user = useAuthStore.getState().currentUser;
  if (!user) return;
  const venues = useVenueStore.getState().venues.filter(
    (v) => v.managerId === user.id && !v.isHidden && v.schedule && v.schedule.length > 0
  );
  if (venues.length === 0) return;

  const existing = useSlotStore.getState().slots;
  const have = new Set(existing.map((s) => slotKey(s.venueId, s.date, s.startTime, s.endTime)));

  type Pending = { venueId: string; date: string; startTime: string; endTime: string };
  const pending: Pending[] = [];

  for (let date = fromStr; date <= toStr; date = addDaysStr(date, 1)) {
    const wd = weekdayOf(date);
    for (const v of venues) {
      for (const set of setsForDay(v.schedule, wd)) {
        const key = slotKey(v.id, date, set.startTime, set.endTime);
        if (have.has(key) || inflight.has(key)) continue;
        have.add(key);
        inflight.add(key);
        pending.push({ venueId: v.id, date, startTime: set.startTime, endTime: set.endTime });
      }
    }
  }
  if (pending.length === 0) return;

  const rows = pending.map((p) => ({
    venue_id: p.venueId,
    manager_id: user.id,
    name: '',
    date: p.date,
    start_time: p.startTime,
    end_time: p.endTime,
    schedule_generated: true,
  }));

  try {
    const { data, error } = await supabase.from('slots').insert(rows).select();
    if (error || !data) return;
    const newSlots: Slot[] = data.map((s: any) => ({
      id: s.id,
      venueId: s.venue_id,
      date: s.date,
      name: s.name ?? '',
      startTime: s.start_time,
      endTime: s.end_time,
      scheduleGenerated: true,
      createdAt: s.created_at,
    }));
    useSlotStore.getState().bulkAddSlots(newSlots);
  } finally {
    for (const p of pending) inflight.delete(slotKey(p.venueId, p.date, p.startTime, p.endTime));
  }
}

/**
 * After a programme edit, remove EVERY future slot for this venue that no longer matches the
 * new programme AND has no artist (no booking, no draft) — including manual one-off empty
 * slots. A night that already has an artist is never touched. New nights get filled by
 * ensureScheduleSlots. Runs only on a programme save, never on plain calendar viewing, so a
 * freshly-added one-off slot isn't wiped out from under the manager.
 */
export async function reconcileScheduleSlots(venueId: string): Promise<void> {
  const venue = useVenueStore.getState().venues.find((v) => v.id === venueId);
  if (!venue) return;
  const today = todayLocalStr();

  const valid = new Set<string>(); // weekday|start|end still in the programme
  (venue.schedule ?? []).forEach((s) => valid.add(`${s.day}|${s.startTime}|${s.endTime}`));

  const bookings = useBookingStore.getState().bookings;
  const drafts = useDraftStore.getState().drafts;

  const toDelete = useSlotStore
    .getState()
    .slots.filter((s) => {
      if (s.venueId !== venueId || s.date < today) return false;       // this venue, future only
      if (valid.has(`${weekdayOf(s.date)}|${s.startTime}|${s.endTime}`)) return false; // still scheduled
      const hasBooking = bookings.some((b) => b.slotId === s.id && !b.hiddenFromManagerCalendar);
      const hasDraft = drafts.some((d) => d.slotId === s.id);
      return !hasBooking && !hasDraft; // empty only — no artist booked or drafted
    })
    .map((s) => s.id);

  if (toDelete.length === 0) return;

  const deleteSlot = useSlotStore.getState().deleteSlot;
  toDelete.forEach((id) => deleteSlot(id));
  await supabase.from('slots').delete().in('id', toDelete);
}
