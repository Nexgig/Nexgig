import type { VenueSchedule, VenueScheduleSet } from '@/lib/types';

// Monday-first everywhere (matches the calendar + bulk day indices: 0=Mon … 6=Sun).
export const DAY_MIN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** JS Date.getDay() (0=Sun) → Monday-first index (0=Mon … 6=Sun). */
export function toMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** "Mon, Tue" for a set's days, in week order. */
export function setDaysLabel(days: number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(', ');
}

let counter = 0;
export function newSetId(): string {
  counter += 1;
  return `set-${Date.now()}-${counter}`;
}

/** A programme is "usable" only once at least one set has both a day and a time. */
export function scheduleHasContent(schedule: VenueSchedule | undefined): boolean {
  return !!schedule && schedule.some((s) => s.days.length > 0);
}

export function makeEmptySet(): VenueScheduleSet {
  return { id: newSetId(), days: [], startTime: '20:00', endTime: '00:00' };
}
