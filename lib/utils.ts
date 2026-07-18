import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { InstrumentType } from "@/lib/types";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the current LOCAL date as "YYYY-MM-DD".
 * Use this instead of `new Date().toISOString().slice(0,10)` / `.split('T')[0]`,
 * which return the UTC date and are a day behind in positive-offset timezones
 * (e.g. Dubai, UTC+4) between local midnight and UTC midnight.
 */
export function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Returns the current local datetime as a comparable string: "YYYY-MM-DDTHH:MM"
 * Used for upcoming/completed logic based on start time.
 */
export function nowLocalDateTimeStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/**
 * Returns a comparable datetime string "YYYY-MM-DDTHH:MM" from a date + optional startTime.
 * If no startTime, defaults to "00:00" (start of day) — meaning date-only slots are
 * treated as starting at midnight and become past after midnight.
 */
export function slotDateTimeStr(date: string, startTime?: string): string {
  return `${date}T${startTime ?? '00:00'}`;
}

/**
 * Returns true if the slot/booking has NOT yet started (i.e. it's upcoming).
 * A booking is upcoming if its start datetime >= now.
 */
export function isUpcoming(date: string, startTime?: string): boolean {
  return slotDateTimeStr(date, startTime) >= nowLocalDateTimeStr();
}

/**
 * Returns true if the slot/booking has already started.
 * NOTE: "started" is not "finished" — for completion use isPastEnd(). This is for
 * upcoming/filtering decisions only.
 */
export function isPastStart(date: string, startTime?: string): boolean {
  return slotDateTimeStr(date, startTime) < nowLocalDateTimeStr();
}

/**
 * "2026-06-15" → "2026-06". A sortable/comparable month bucket, for deciding when a
 * list crosses into a new month.
 */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * "2026-06-15" → "June" (or "January 2027" when it isn't the current year).
 *
 * The DateBadge shows weekday + day but NOT the month, so a list spanning months is
 * ambiguous without this. The year is dropped in the common case because it's noise —
 * and kept when it isn't, since "January" alone across a Dec→Jan boundary is a coin flip.
 */
export function monthLabel(dateStr: string): string {
  const [y, mo] = dateStr.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  const month = d.toLocaleString('en-US', { month: 'long' });
  return y === new Date().getFullYear() ? month : `${month} ${y}`;
}

/**
 * Normalises a time to "HH:MM". Times are stored as text and are normally already
 * 'HH:MM', but anything arriving as 'HH:MM:SS' would break the string comparisons
 * every datetime helper here relies on ('22:00:00' > '22:00').
 */
export function hhmm(time: string): string {
  const [h, m] = time.split(':');
  const hNum = Number(h);
  const mNum = Number(m);
  if (Number.isNaN(hNum) || Number.isNaN(mNum)) return time;
  return `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
}

/**
 * Adds `days` to a "YYYY-MM-DD" string and returns the same format.
 * Built from local Y/M/D components on purpose — `new Date("2026-07-17")` parses as
 * UTC midnight, which is the previous day in Dubai (UTC+4).
 */
export function addDaysStr(date: string, days: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Comparable end datetime "YYYY-MM-DDTHH:MM" for a slot/booking.
 *
 * Nightlife gigs cross midnight: the defaults are 20:00–00:00 and 21:00–01:00, so
 * end < start means the gig ENDS THE NEXT DAY. Without the roll-forward a 22:00–03:00
 * gig computes an end five hours BEFORE its own start and is instantly "finished".
 *
 * A zero-length slot (end === start) does NOT roll — it ends the moment it starts
 * rather than covering a full 24h. timesOverlap() depends on that to treat such a
 * range as covering no time at all. **The SQL in supabase/complete-past-bookings.sql
 * mirrors this exact rule (`et < st`) — change one, change both.**
 *
 * No endTime (legacy bookings — Booking.slotEndTime is optional) falls back to the
 * start datetime, i.e. the old start-based behaviour.
 */
export function slotEndDateTimeStr(date: string, startTime?: string, endTime?: string): string {
  if (!endTime) return slotDateTimeStr(date, startTime);
  const start = hhmm(startTime ?? '00:00');
  const end = hhmm(endTime);
  return `${end < start ? addDaysStr(date, 1) : date}T${end}`;
}

/**
 * Returns true if the slot/booking has FINISHED. This is what drives completion —
 * a gig is done when its end time has passed, not when it started.
 */
export function isPastEnd(date: string, startTime?: string, endTime?: string): boolean {
  return slotEndDateTimeStr(date, startTime, endTime) < nowLocalDateTimeStr();
}

/**
 * Days after a set ends during which an unanswered request still reads as "Pending".
 * NOT dead time: a past-end request is the "did you play this gig?" prompt, and confirming
 * it marks the gig completed. Only once nobody has answered for this long is it stale.
 */
export const REQUEST_EXPIRY_GRACE_DAYS = 7;

/**
 * An unanswered request goes grey `expired` once it's this stale — a gold "Pending" on a gig
 * from last month implies someone still has to act, and nobody does.
 * Display-only: the stored status is untouched, so history and the confirm/decline actions
 * both still work.
 */
export function displayStatus(status: string, date?: string, startTime?: string, endTime?: string): string {
  if (status !== 'requested' && status !== 'past_confirmation') return status;
  if (!date) return status;
  const deadline = addDaysStr(slotEndDateTimeStr(date, startTime, endTime).slice(0, 10), REQUEST_EXPIRY_GRACE_DAYS);
  return `${deadline}T23:59` < nowLocalDateTimeStr() ? 'expired' : status;
}

/**
 * The label shown under an artist's name on every card / profile.
 * An artist picks their setup at signup (multi-select). If 'CDJ / Turntables'
 * is among their instruments they're a DJ; any other instrument makes them a
 * Musician. Empty only happens for legacy accounts created before the choice
 * was mandatory — falls back to 'Artist'.
 */
/**
 * The subtitle under an artist's name in every list (Network, Assign Artist,
 * Add Set, My Artists, venue Lineup).
 *
 * Shows their PRIMARY GENRE — far more useful to a manager picking who to book
 * than "DJ" / "Musician", which every artist shares. Falls back to performerLabel
 * when the genre is missing (older rows, incomplete signups).
 */
export function genreLabel(
  primaryGenre?: string | null,
  instruments?: (InstrumentType | string)[] | null,
): string {
  const g = (primaryGenre ?? '').trim();
  return g || performerLabel(instruments);
}

export function performerLabel(instruments?: (InstrumentType | string)[] | null): string {
  if (!instruments || instruments.length === 0) return 'Artist';
  return instruments.includes('CDJ / Turntables') ? 'DJ' : 'Musician';
}
