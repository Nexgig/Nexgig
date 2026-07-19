import { create } from 'zustand';
import { supabase } from './supabase';
import { useAuthStore, useLineupStore, resetAllStores } from './store';
import { reportError } from './observability';

export type Role = 'manager' | 'artist';

/**
 * Dual-role accounts: one login, optionally a profile on BOTH sides.
 *
 * `artists.id` and `managers.id` are both `auth.users.id`, so the database already allows
 * one account to have a row in each table. What was missing is app-side: something to say
 * which role is currently active, and a way to move between them.
 *
 * The active role is NOT a new piece of state — it is `currentUser.accountType`, which is
 * already persisted. Switching rewrites currentUser from the other table, so the choice
 * survives an app restart for free. Signing out drops it, and the next sign-in falls back
 * to the role stamped on the auth user at signup.
 */

/**
 * True while a role switch is in flight. The profile screens drop their RefreshControl
 * when it is set.
 *
 * Why: switching is the only cross-group router.replace in the app — everything else uses
 * push, which leaves the old screen mounted underneath. replace tears the whole group down,
 * and unmounting a ScrollView that owns a UIRefreshControl crashed the app natively:
 * RCTPullToRefreshViewComponentView._detach calls -endRefreshingAnimated: on the way out,
 * which reads back from a UIScrollView already being released. Native, so Sentry never saw
 * it. Taking the refresh control out of the tree a frame early means it is not part of the
 * teardown transaction at all.
 */
export const useRoleSwitching = create<{ switching: boolean; setSwitching: (v: boolean) => void }>((set) => ({
  switching: false,
  setSwitching: (v) => set({ switching: v }),
}));

/** Which sides this account has a profile on. Both false means an abandoned signup. */
export async function rolesAvailable(email: string): Promise<{ manager: boolean; artist: boolean }> {
  const e = email.trim().toLowerCase();
  const [{ data: m }, { data: a }] = await Promise.all([
    supabase.from('managers').select('id').eq('email', e).maybeSingle(),
    supabase.from('artists').select('id').eq('email', e).maybeSingle(),
  ]);
  return { manager: !!m, artist: !!a };
}

/**
 * Make `role` the signed-in identity, reading that side's profile row into the stores.
 * Returns false when the account has no profile on that side.
 *
 * This is the ONLY place either role is hydrated — sign-in and the role switcher both call
 * it. Duplicating it would let the two drift, and the artist branch in particular hydrates
 * a second store (artistProfiles) that is easy to forget.
 */
export async function hydrateRole(
  role: Role,
  authUser: { id: string; email?: string | null; created_at?: string }
): Promise<boolean> {
  const email = (authUser.email ?? '').trim().toLowerCase();
  const createdAt = authUser.created_at ?? new Date().toISOString();
  const setCurrentUser = useAuthStore.getState().setCurrentUser;

  if (role === 'manager') {
    const { data: managerProfile } = await supabase
      .from('managers').select('*').eq('email', email).maybeSingle();
    if (!managerProfile) return false;

    // Keep the users row in step with the managers row — it's what other screens join on.
    await supabase.from('users').upsert({
      id: authUser.id,
      email: managerProfile.email,
      full_name: managerProfile.full_name,
      account_type: 'manager',
      phone: managerProfile.phone ?? '',
      is_phone_verified: false,
      is_email_verified: true,
    }, { onConflict: 'id' });

    setCurrentUser({
      id: authUser.id,
      email: managerProfile.email,
      phone: managerProfile.phone ?? '',
      accountType: 'manager',
      fullName: managerProfile.full_name,
      bio: managerProfile.bio ?? undefined,
      location: managerProfile.based_in ?? undefined,
      companyName: managerProfile.company_name ?? undefined,
      profilePhotoUrl: managerProfile.profile_photo_url ?? undefined,
      avatarId: managerProfile.avatar_id ?? undefined,
      isPhoneVerified: false,
      isEmailVerified: true,
      createdAt,
      updatedAt: createdAt,
    });
    return true;
  }

  const { data: artistProfile } = await supabase
    .from('artists').select('*').eq('email', email).maybeSingle();
  if (!artistProfile) return false;

  // Phone lives on the users row, not on artists.
  const { data: artistUserRow } = await supabase
    .from('users').select('phone, is_phone_verified').eq('id', authUser.id).maybeSingle();

  setCurrentUser({
    id: authUser.id,
    email: artistProfile.email,
    phone: artistUserRow?.phone ?? '',
    accountType: 'artist',
    fullName: artistProfile.full_name,
    fullLegalName: artistProfile.full_legal_name ?? undefined,
    username: artistProfile.username ?? undefined,
    bio: artistProfile.bio ?? undefined,
    location: artistProfile.based_in ?? undefined,
    yearsOfExperience: artistProfile.years_of_experience ?? undefined,
    profilePhotoUrl: artistProfile.profile_photo_url ?? undefined,
    avatarId: artistProfile.avatar_id ?? undefined,
    isPhoneVerified: artistUserRow?.is_phone_verified ?? false,
    isEmailVerified: true,
    createdAt,
    updatedAt: createdAt,
  });

  // Genres, instruments, rate and social links live in useLineupStore.artistProfiles —
  // NOT on currentUser — and the profile screens read them from there. Without this the
  // artist side comes up blank.
  useLineupStore.getState().updateArtistProfile(authUser.id, {
    userId: authUser.id,
    primaryGenre: artistProfile.primary_genre ?? undefined,
    secondaryGenres: Array.isArray(artistProfile.secondary_genres) ? artistProfile.secondary_genres : [],
    instruments: Array.isArray(artistProfile.instruments) ? artistProfile.instruments : [],
    gender: artistProfile.gender ?? undefined,
    minRate: artistProfile.min_rate ?? undefined,
    basedIn: artistProfile.based_in ?? undefined,
    nationality: artistProfile.nationality ?? undefined,
    instagramUrl: artistProfile.instagram_url ?? undefined,
    soundcloudUrl: artistProfile.soundcloud_url ?? undefined,
    mixcloudUrl: artistProfile.mixcloud_url ?? undefined,
    spotifyUrl: artistProfile.spotify_url ?? undefined,
    isHistoryHidden: artistProfile.is_history_hidden ?? undefined,
  });
  return true;
}

/**
 * Move the session to the other role. Returns false if that profile doesn't exist, leaving
 * the current one untouched.
 *
 * The cached data is wiped FIRST: every store is loaded for one side (a manager's venues,
 * an artist's bookings) and none of it is scoped by role. Switching without clearing shows
 * the artist their manager's venues until the next fetch, which reads as data leaking
 * between accounts.
 */
export async function switchRole(target: Role): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return false;
    resetAllStores();
    const ok = await hydrateRole(target, data.user);
    return ok;
  } catch (e) {
    reportError(e, { where: 'switchRole', target });
    return false;
  }
}
