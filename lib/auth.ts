import { supabase } from './supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, fullName: string, accountType: 'manager' | 'artist') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, account_type: accountType },
    },
  });
  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase.from('users').insert({
      id: data.user.id,
      email,
      full_name: fullName,
      account_type: accountType,
      phone: '',
      is_phone_verified: false,
      is_email_verified: false,
    });
    if (profileError) console.warn('Profile insert error:', profileError.message);
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── OAuth: Sign in with Apple (native iOS) ──────────────────────────────────
// Returns { user, fullName } on success, or null if the user cancelled.
export async function signInWithApple(): Promise<{ user: import('@supabase/supabase-js').User; fullName?: string } | null> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign in failed — no user returned.');

  // Apple only returns the name on the FIRST sign-in ever; capture it when present.
  const fullName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim() || undefined
    : undefined;

  return { user: data.user, fullName };
}

// ─── OAuth: Sign in with Google (native) ─────────────────────────────────────
// Returns { user, fullName } on success, or null if the user cancelled.
export async function signInWithGoogle(): Promise<{ user: import('@supabase/supabase-js').User; fullName?: string } | null> {
  GoogleSignin.configure({
    // Web client ID is used by Supabase to verify the Google ID token audience.
    webClientId: '1090523281211-siff07eqq60fsc9bsbhvej5gsbp1s5pq.apps.googleusercontent.com',
    iosClientId: '1090523281211-facnl2rejtk7oivo71nir9h70jt3o2ot.apps.googleusercontent.com',
  });

  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  // v16 returns { type: 'success' | 'cancelled', data }
  if (response.type === 'cancelled') return null;

  const idToken = response.data?.idToken;
  if (!idToken) throw new Error('No ID token returned from Google.');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign in failed — no user returned.');

  const fullName = response.data?.user?.name ?? undefined;

  return { user: data.user, fullName };
}

// ─── Resolve where a signed-in user should go ────────────────────────────────
// Checks managers then artists table by email. Returns the account type, or
// 'new' if the user exists in neither table yet (a brand-new OAuth user).
export async function resolveAccountRoute(
  email: string
): Promise<'manager' | 'artist' | 'new'> {
  const lower = email.trim().toLowerCase();

  const { data: managerProfile } = await supabase
    .from('managers')
    .select('id')
    .eq('email', lower)
    .maybeSingle();
  if (managerProfile) return 'manager';

  const { data: artistProfile } = await supabase
    .from('artists')
    .select('id')
    .eq('email', lower)
    .maybeSingle();
  if (artistProfile) return 'artist';

  return 'new';
}