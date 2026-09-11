// Billing-cycle windows for a venue.
//
// A venue's cycle ENDS on `cycleEndDay` (1-31, clamped to the month length — so 31 means the
// last day of every calendar month, the normal case). The next cycle starts the day after.
// This is the SAME rule the manager calendar uses for its "Monthly actual" period
// (app/(manager)/(tabs)/calendar.tsx → monthPeriodBounds): the two must agree, so any change
// to the windowing belongs here and there together.
//
// Used by the artist invoicing flow to let an artist invoice one billing cycle at a time.

export interface BillingCycle {
  /** Stable key for the cycle — its inclusive end date, 'YYYY-MM-DD'. */
  key: string;
  /** Human label: a whole calendar month reads "September 2025"; a shifted cycle reads
   *  "16 Aug – 15 Sep 2025". */
  label: string;
  /** Inclusive start date, 'YYYY-MM-DD'. */
  start: string;
  /** Inclusive end date, 'YYYY-MM-DD'. */
  end: string;
}

function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(year, monthZeroIdx + 1, 0).getDate();
}

function ymd(year: number, monthZeroIdx: number, day: number): string {
  // Construct through Date so day overflow normalises (e.g. lastDay+1 → the 1st of next month).
  const d = new Date(year, monthZeroIdx, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function cycleLabel(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const endLastDay = lastDayOfMonth(e.getFullYear(), e.getMonth());
  const wholeMonth =
    s.getDate() === 1 &&
    s.getMonth() === e.getMonth() &&
    s.getFullYear() === e.getFullYear() &&
    e.getDate() === endLastDay;
  if (wholeMonth) return e.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const startLabel = s.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const endLabel = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

/**
 * The billing cycle (inclusive start..end) that `dateStr` ('YYYY-MM-DD') falls into, for a venue
 * whose cycle ends on `cycleEndDay`. Mirrors the manager calendar's monthPeriodBounds:
 *   end   = day `cycleEndDay` of the cycle's end month, clamped to that month's length
 *   start = the day AFTER the previous cycle's end
 * so cycles are contiguous with no gap or overlap.
 */
export function cycleForDate(cycleEndDay: number, dateStr: string): BillingCycle {
  const day = Math.min(Math.max(Math.round(cycleEndDay) || 31, 1), 31);
  const [y, m] = dateStr.split('-').map(Number); // m is 1-based
  const m0 = m - 1;

  // Which month does this date's cycle end in? If the date is past this month's cycle end,
  // it belongs to next month's cycle.
  const endDayThisMonth = Math.min(day, lastDayOfMonth(y, m0));
  const dNum = Number(dateStr.slice(8, 10));
  let endY = y;
  let endM0 = m0;
  if (dNum > endDayThisMonth) {
    endM0 = m0 + 1;
    if (endM0 > 11) { endM0 = 0; endY = y + 1; }
  }

  const endDay = Math.min(day, lastDayOfMonth(endY, endM0));
  const end = ymd(endY, endM0, endDay);

  // Start = the day after the previous cycle's end.
  let startY = endY;
  let startM0 = endM0 - 1;
  if (startM0 < 0) { startM0 = 11; startY = endY - 1; }
  const prevEndDay = Math.min(day, lastDayOfMonth(startY, startM0));
  const start = ymd(startY, startM0, prevEndDay + 1);

  return { key: end, label: cycleLabel(start, end), start, end };
}

/**
 * Buckets `items` into billing cycles (newest cycle first) for a venue with the given
 * `cycleEndDay`. `getDate` returns each item's 'YYYY-MM-DD' — the caller should default a
 * missing date to today so an undated gig still lands in the current cycle (never dropped).
 */
export function groupByCycle<T>(
  items: T[],
  getDate: (item: T) => string,
  cycleEndDay: number,
): { cycle: BillingCycle; items: T[] }[] {
  const groups = new Map<string, { cycle: BillingCycle; items: T[] }>();
  for (const item of items) {
    const dateStr = getDate(item);
    if (!dateStr) continue;
    const cycle = cycleForDate(cycleEndDay, dateStr);
    let g = groups.get(cycle.key);
    if (!g) { g = { cycle, items: [] }; groups.set(cycle.key, g); }
    g.items.push(item);
  }
  return Array.from(groups.values()).sort((a, b) => (a.cycle.key < b.cycle.key ? 1 : -1));
}
