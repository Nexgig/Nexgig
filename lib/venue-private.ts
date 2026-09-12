import { supabase } from './supabase';
import type { VenueMonthlyBudget } from './types';

/**
 * Manager-only venue data — the monthly budgets and billing emails — lives in the
 * `venue_private` table (RLS: owner-only), NOT on the `venues` row, so a connected
 * artist can't read it. These helpers load it for the manager's venues and save it.
 */
export type VenuePrivateFields = { monthlyBudgets?: VenueMonthlyBudget[]; billingEmails?: string[] };

/** Fetch the private fields for a set of venues, keyed by venue id. Fails soft (empty map). */
export async function fetchVenuePrivate(venueIds: string[]): Promise<Record<string, VenuePrivateFields>> {
  const out: Record<string, VenuePrivateFields> = {};
  if (!venueIds.length) return out;
  const { data, error } = await supabase
    .from('venue_private')
    .select('venue_id, monthly_budgets, billing_emails')
    .in('venue_id', venueIds);
  if (error || !data) return out;
  for (const r of data as { venue_id: string; monthly_budgets?: unknown; billing_emails?: unknown }[]) {
    out[r.venue_id] = {
      monthlyBudgets: Array.isArray(r.monthly_budgets) ? (r.monthly_budgets as VenueMonthlyBudget[]) : undefined,
      billingEmails: Array.isArray(r.billing_emails) ? (r.billing_emails as string[]) : undefined,
    };
  }
  return out;
}

/** Merge the private fields into a list of venues in place (managers only). */
export async function mergeVenuePrivate<T extends { id: string; monthlyBudgets?: VenueMonthlyBudget[]; billingEmails?: string[] }>(
  venues: T[],
): Promise<T[]> {
  const priv = await fetchVenuePrivate(venues.map((v) => v.id));
  for (const v of venues) {
    const p = priv[v.id];
    if (p) { v.monthlyBudgets = p.monthlyBudgets; v.billingEmails = p.billingEmails; }
  }
  return venues;
}

/** Upsert one venue's private fields. Only the fields you pass are written. */
export async function saveVenuePrivate(
  venueId: string,
  managerId: string,
  fields: VenuePrivateFields,
): Promise<{ error: unknown }> {
  const row: Record<string, unknown> = { venue_id: venueId, manager_id: managerId, updated_at: new Date().toISOString() };
  if (fields.monthlyBudgets !== undefined) row.monthly_budgets = fields.monthlyBudgets;
  if (fields.billingEmails !== undefined) row.billing_emails = fields.billingEmails;
  const { error } = await supabase.from('venue_private').upsert(row, { onConflict: 'venue_id' });
  return { error };
}
