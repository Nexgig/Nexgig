import { supabase } from './supabase';
import { resetAllStores, useAuthStore } from './store';
import { hydrateRole, type Role } from './roles';

export interface DeleteResult {
  /** True when the whole account (both profiles + login) is gone. False when only the
   *  named role was removed and the other survives. */
  fullyDeleted: boolean;
  /** The role still signed in after a partial delete, or null on a full delete. */
  remaining: Role | null;
}

/**
 * Deletes the given ROLE's account.
 *
 * Dual-role accounts share one login across a manager and an artist profile, so this is
 * scoped: deleting from artist mode removes the artist profile only and leaves the manager
 * profile and the login intact. The login is deleted server-side only when the role being
 * removed is the last one. (Before this, delete-from-either-side wiped everything.)
 *
 * The `delete-account` Edge Function does the work with the service-role key. On a FULL
 * delete this clears local stores and signs out; on a PARTIAL delete it re-hydrates the
 * surviving role so the caller can drop the user into that side instead of the login screen.
 *
 * Throws an Error (user-readable) on failure.
 */
export async function deleteAccount(role: Role): Promise<DeleteResult> {
  // Must have a live session to authorize the call.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('You are not signed in. Please sign in again and retry.');
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    body: { role },
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

  const result = data as { fullyDeleted?: boolean; remaining?: Role | null };
  const remaining = result?.remaining ?? null;
  // Treat a missing `fullyDeleted` as a full delete — the safe default is to sign out
  // rather than risk stranding a session on a half-deleted account.
  const fullyDeleted = result?.fullyDeleted !== false && !remaining;

  // Either way the departing role's data is gone and the local stores are loaded for it,
  // so clear them.
  resetAllStores();

  if (!fullyDeleted && remaining) {
    // The other profile survives — re-hydrate it so the app can show that side.
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const ok = await hydrateRole(remaining, authData.user);
      if (ok) return { fullyDeleted: false, remaining };
    }
    // Re-hydrate failed (offline?). Fall through to sign-out rather than sit on empty
    // stores with a stale session — the surviving profile is intact and a fresh sign-in
    // recovers it.
  }

  // Full delete, or a partial we couldn't re-hydrate: end the session.
  useAuthStore.getState().signOut();
  try {
    await supabase.auth.signOut();
  } catch {
    // Session may already be invalid now that the auth user is deleted — ignore.
  }
  return { fullyDeleted: true, remaining: null };
}
