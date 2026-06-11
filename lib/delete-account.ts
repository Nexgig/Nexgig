import { supabase } from './supabase';
import { resetAllStores } from './store';

/**
 * Permanently deletes the current user's account.
 *
 * Calls the `delete-account` Supabase Edge Function, which (server-side, with the
 * service-role key):
 *  - anonymizes shared history (bookings / lineup / venue assignments → "Former …")
 *  - deactivates a manager's venues (kept for history, hidden from active use)
 *  - deletes the user's private data (notifications, availability, invoices, etc.)
 *  - deletes the identity rows and the auth login itself
 *
 * On success this clears all local stores and signs the user out locally.
 * Throws an Error (with a user-readable message) on failure.
 */
export async function deleteAccount(): Promise<void> {
  // Must have a live session to authorize the call.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('You are not signed in. Please sign in again and retry.');
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) {
    // supabase-js puts the raw Response on error.context for non-2xx replies.
    // Pull the function's real error/details out so we surface the actual cause.
    let detail = error.message;
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as { error?: string; details?: unknown };
        if (body?.error) {
          detail = body.error + (body.details ? `: ${JSON.stringify(body.details)}` : '');
        }
      } catch {
        // body wasn't JSON — keep the generic message
      }
    }
    throw new Error(detail || 'Could not delete your account. Please try again.');
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }

  // Account is gone server-side. Clear local state and end the session.
  resetAllStores();
  try {
    await supabase.auth.signOut();
  } catch {
    // Session may already be invalid now that the auth user is deleted — ignore.
  }
}
