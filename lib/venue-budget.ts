import type { Venue, VenueMonthlyBudget } from '@/lib/types';

/** The budget target for a venue in a given calendar month (`month` is 1-12). A per-month
 *  `monthlyBudgets` entry wins; otherwise the legacy flat `monthlyBudget` applies to every
 *  month as a fallback. Returns undefined when neither is set. */
export function venueBudgetFor(v: Venue, year: number, month: number): number | undefined {
  const entry = v.monthlyBudgets?.find((b) => b.year === year && b.month === month);
  if (entry && entry.amount > 0) return entry.amount;
  return v.monthlyBudget;
}

/** Clean a per-month budget list for persistence: drop zero/empty amounts, dedupe by
 *  (year, month) keeping the last edit, and sort chronologically. */
export function normalizeBudgets(list: VenueMonthlyBudget[]): VenueMonthlyBudget[] {
  const byKey = new Map<string, VenueMonthlyBudget>();
  for (const b of list) {
    if (!(b.amount > 0)) continue;
    byKey.set(`${b.year}-${b.month}`, { year: b.year, month: b.month, amount: b.amount });
  }
  return [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}
