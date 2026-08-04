import type { VenueSchedule, VenueScheduleSet } from '@/lib/types';

// Monday-first everywhere (matches the calendar + bulk day indices: 0=Mon … 6=Sun).
export const DAY_MIN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** JS Date.getDay() (0=Sun) → Monday-first index (0=Mon … 6=Sun). */
export function toMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** A day's sets, earliest start first. */
export function setsForDay(schedule: VenueSchedule | undefined, day: number): VenueScheduleSet[] {
  return (schedule ?? [])
    .filter((s) => s.day === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Which weekdays have at least one set. */
export function daysWithSets(schedule: VenueSchedule | undefined): Set<number> {
  return new Set((schedule ?? []).map((s) => s.day));
}

export function scheduleHasContent(schedule: VenueSchedule | undefined): boolean {
  return !!schedule && schedule.length > 0;
}

let counter = 0;
export function newSetId(): string {
  counter += 1;
  return `set-${Date.now()}-${counter}`;
}

export function makeSetForDay(day: number): VenueScheduleSet {
  return { id: newSetId(), day, startTime: '21:00', endTime: '01:00' };
}
