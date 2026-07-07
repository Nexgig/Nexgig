import type { Booking, AvailabilityBlock, Slot, ConflictInfo, ArtistWithConflict, User, Lineup, ArtistProfile } from './types';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Time format preference (12h / 24h) ──────────────────────────────────────
// Times are ALWAYS stored as 24h "HH:MM" strings; this only controls DISPLAY.
// Default is 24h (matches stored values + UAE norm). Toggle lives in Settings.
export type TimeFormat = '12h' | '24h';

interface TimeFormatState {
  format: TimeFormat;
  setFormat: (f: TimeFormat) => void;
}

export const useTimeFormatStore = create<TimeFormatState>()(
  persist(
    (set) => ({
      format: '24h',
      setFormat: (f) => set({ format: f }),
    }),
    {
      name: 'nexgig:time-format',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Pure formatter given an explicit format.
export function formatTimeValue(timeStr: string, fmt: TimeFormat): string {
  if (!timeStr) return '';
  const [hRaw, mRaw] = timeStr.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  if (fmt === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Check if two time ranges overlap.
 */
export function timesOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
  dateA: string, dateB: string
): boolean {
  if (dateA !== dateB) return false;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const startAMin = toMinutes(startA);
  const endAMin = toMinutes(endA) <= toMinutes(startA) ? toMinutes(endA) + 24 * 60 : toMinutes(endA);
  const startBMin = toMinutes(startB);
  const endBMin = toMinutes(endB) <= toMinutes(startB) ? toMinutes(endB) + 24 * 60 : toMinutes(endB);
  return startAMin < endBMin && endAMin > startBMin;
}

/**
 * Detect conflicts for a DJ against a specific slot.
 */
export function detectConflicts(
  artistId: string,
  slot: Slot,
  confirmedBookings: Booking[],
  availabilityBlocks: AvailabilityBlock[],
  getVenueName: (venueId: string) => string,
  getSlotById: (slotId: string) => Slot | undefined,
  draftSlots?: Array<{ slotId: string; date: string; startTime: string; endTime: string; venueName: string; slotName: string }>,
  allBookings?: Booking[]
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  for (const booking of confirmedBookings) {
    if (booking.artistId !== artistId) continue;
    if (booking.status !== 'confirmed' && booking.status !== 'requested') continue;
    if (booking.slotId === slot.id) continue; // skip self
    // Use slot store first, fall back to booking's own date/time snapshot
    const bookingSlot = getSlotById(booking.slotId);
    const bDate = bookingSlot?.date ?? booking.slotDate;
    const bStart = bookingSlot?.startTime ?? booking.slotStartTime;
    const bEnd = bookingSlot?.endTime ?? booking.slotEndTime;
    if (!bDate || !bStart || !bEnd) continue;
    if (timesOverlap(bStart, bEnd, slot.startTime, slot.endTime, bDate, slot.date)) {
      const venueName = getVenueName(booking.venueId);
      conflicts.push({
        type: 'booking',
        description: venueName && venueName !== 'Unknown Venue'
          ? `Booked at ${venueName} ${bStart}–${bEnd}`
          : `Unavailable ${bStart}–${bEnd}`,
        venueName,
        slotName: bookingSlot?.name ?? booking.slotName,
        startTime: bStart,
        endTime: bEnd,
      });
    }
  }
  for (const block of availabilityBlocks) {
    if (block.artistId !== artistId) continue;
    if (timesOverlap(
      block.startTime, block.endTime,
      slot.startTime, slot.endTime,
      block.date, slot.date
    )) {
      conflicts.push({
        type: 'availability_block',
        description: `Unavailable ${block.startTime}–${block.endTime}`,
        startTime: block.startTime,
        endTime: block.endTime,
      });
    }
  }
  // Check artist-created private events as unavailability (same as blocks)
  const privateBookings = (allBookings ?? confirmedBookings).filter(
    (b) => b.artistId === artistId && b.isArtistCreated && b.status === 'confirmed' && b.slotDate && b.slotStartTime && b.slotEndTime
  );
  for (const pb of privateBookings) {
    if (timesOverlap(
      pb.slotStartTime!, pb.slotEndTime!,
      slot.startTime, slot.endTime,
      pb.slotDate!, slot.date
    )) {
      conflicts.push({
        type: 'availability_block',
        description: `Unavailable ${pb.slotStartTime}–${pb.slotEndTime}`,
        startTime: pb.slotStartTime!,
        endTime: pb.slotEndTime!,
      });
    }
  }
  // Check draft assignments for this DJ
  if (draftSlots) {
    for (const draft of draftSlots) {
      if (draft.slotId === slot.id) continue; // same slot — not a conflict
      if (timesOverlap(
        draft.startTime, draft.endTime,
        slot.startTime, slot.endTime,
        draft.date, slot.date
      )) {
        conflicts.push({
          type: 'booking',
          description: draft.venueName && draft.venueName !== 'Unknown Venue'
            ? `Drafted at ${draft.venueName} ${draft.startTime}–${draft.endTime}`
            : `Drafted ${draft.startTime}–${draft.endTime}`,
          venueName: draft.venueName,
          slotName: draft.slotName,
          startTime: draft.startTime,
          endTime: draft.endTime,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Build a list of DJs with conflict info for a given slot.
 */
export function buildDJsWithConflicts(
  lineups: Lineup[],
  slot: Slot,
  artistUsers: User[],
  confirmedBookings: Booking[],
  availabilityBlocks: AvailabilityBlock[],
  getVenueName: (venueId: string) => string,
  getSlotById: (slotId: string) => Slot | undefined,
  getArtistProfile: (userId: string) => ArtistProfile | undefined
): ArtistWithConflict[] {
  return lineups
    .filter((r) => r.status === 'active')
    .map((lineup) => {
      const user = artistUsers.find((u) => u.id === lineup.artistId);
      if (!user) return null;
      const djProfile = getArtistProfile(lineup.artistId);
      const conflicts = detectConflicts(
        lineup.artistId, slot, confirmedBookings, availabilityBlocks,
        getVenueName, getSlotById
      );
      return {
        user,
        djProfile,
        hasConflict: conflicts.length > 0,
        conflicts,
        lineupStatus: lineup.status,
      } as ArtistWithConflict;
    })
    .filter((d): d is ArtistWithConflict => d !== null);
}

/**
 * Format a date string (YYYY-MM-DD) to a human-readable format.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Format a time string (HH:MM) using the user's current format preference.
 * Non-reactive (reads store state at call time) — safe for any caller. Components
 * that must re-render live when the toggle flips should use useFormatTime() instead.
 */
export function formatTime(timeStr: string): string {
  return formatTimeValue(timeStr, useTimeFormatStore.getState().format);
}

/** Format a start–end range as a single string in the current format. */
export function formatTimeRange(start: string, end: string): string {
  const fmt = useTimeFormatStore.getState().format;
  return `${formatTimeValue(start, fmt)} – ${formatTimeValue(end, fmt)}`;
}

/**
 * Reactive hook: returns formatters bound to the live format preference, so any
 * component using it re-renders immediately when the Settings toggle changes.
 */
export function useFormatTime() {
  const fmt = useTimeFormatStore((s) => s.format);
  return {
    format: fmt,
    formatTime: (t: string) => formatTimeValue(t, fmt),
    formatTimeRange: (s: string, e: string) => `${formatTimeValue(s, fmt)} – ${formatTimeValue(e, fmt)}`,
  };
}

/**
 * Get relative time string (e.g., "2 hours ago").
 */
export function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
