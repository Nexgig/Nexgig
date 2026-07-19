import { supabase } from './supabase';
import { reportWarning } from './observability';

/**
 * Push notification preferences.
 *
 * These used to be AsyncStorage keys read only by the settings screens themselves, which
 * made every switch inert: a notification is created by the OTHER person's device, and that
 * device cannot read this phone's local storage. They now live in Supabase, where the
 * create-notification function can check them before sending (supabase/notification-
 * preferences.sql).
 *
 * Switching one off suppresses the PUSH only — the in-app row is still written, so the
 * notification list stays a complete record and a gig request is never silently lost.
 *
 * `reminders` is the exception: Upcoming Gig and Invoice Reminder are scheduled locally on
 * this device, never through the function, so that one is honoured app-side when scheduling.
 */
export type PrefKey =
  | 'gig_requests' | 'gig_updates' | 'lineup_venues' | 'reminders'
  | 'artist_responses' | 'roster' | 'reviews' | 'invoices';

export type NotificationPrefs = Record<PrefKey, boolean>;

/** Everything on — the state a user with no row is in. */
export const DEFAULT_PREFS: NotificationPrefs = {
  gig_requests: true, gig_updates: true, lineup_venues: true, reminders: true,
  artist_responses: true, roster: true, reviews: true, invoices: true,
};

const COLUMNS: PrefKey[] = Object.keys(DEFAULT_PREFS) as PrefKey[];

/** Read this user's preferences. Missing row, or any failure, means all-on. */
export async function fetchPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(COLUMNS.join(','))
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    reportWarning('fetchPrefs failed', { message: error.message });
    return { ...DEFAULT_PREFS };
  }
  if (!data) return { ...DEFAULT_PREFS };
  const row = data as unknown as Partial<NotificationPrefs>;
  const out = { ...DEFAULT_PREFS };
  for (const k of COLUMNS) if (typeof row[k] === 'boolean') out[k] = row[k] as boolean;
  return out;
}

/**
 * Persist one switch. Upsert rather than update: the row doesn't exist until the first
 * change, which is what lets "no row" mean "all on" and avoids backfilling every account.
 * Returns false if the write failed, so the caller can put the switch back.
 */
export async function savePref(userId: string, key: PrefKey, value: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, [key]: value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' });
  if (error) {
    reportWarning('savePref failed', { key, message: error.message });
    return false;
  }
  return true;
}
