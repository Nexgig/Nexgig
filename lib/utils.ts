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
 * Adds `days` to a "YYYY-MM-DD" string and returns the same format.
 * Built from local Y/M/D components on purpose — `new Date("2026-07-17")` parses as
 * UTC midnight, which is the previous day in Dubai (UTC+4).
 */
function addDaysStr(date: string, days: number): string {
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
 * endTime <= startTime means the gig ENDS THE NEXT DAY. Without the roll-forward a
 * 22:00–03:00 gig computes an end five hours BEFORE its own start and is instantly
 * "finished". Same wrap rule as timesOverlap() in lib/conflict-detection.ts.
 *
 * No endTime (legacy bookings — Booking.slotEndTime is optional) falls back to the
 * start datetime, i.e. the old start-based behaviour.
 */
export function slotEndDateTimeStr(date: string, startTime?: string, endTime?: string): string {
  if (!endTime) return slotDateTimeStr(date, startTime);
  const start = startTime ?? '00:00';
  const endDate = endTime <= start ? addDaysStr(date, 1) : date;
  return `${endDate}T${endTime}`;
}

/**
 * Returns true if the slot/booking has FINISHED. This is what drives completion —
 * a gig is done when its end time has passed, not when it started.
 */
export function isPastEnd(date: string, startTime?: string, endTime?: string): boolean {
  return slotEndDateTimeStr(date, startTime, endTime) < nowLocalDateTimeStr();
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
