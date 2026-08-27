import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { reportWarning } from './observability';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jgzuzkwzoceuzytwadvc.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnenV6a3d6b2NldXp5dHdhZHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTA3OTksImV4cCI6MjA5NDE2Njc5OX0.OVzepl6LdMVyNsZJiXlR33eayu5S_JF0zFFPw3b3SK0';

const CHUNK_SIZE = 1800; // safely under the 2048 byte SecureStore limit

/**
 * The Supabase session is stored in the iOS Keychain. expo-secure-store defaults to
 * `WHEN_UNLOCKED`, so ANY read while the phone is locked throws "User interaction is not
 * allowed" — the `getValueWithKeyAsync` errors in Sentry. It happens off-screen: the token
 * auto-refresh timer fires while the device is locked, so the user never sees a cause.
 *
 * `AFTER_FIRST_UNLOCK` keeps the entry readable while locked, provided the phone has been
 * unlocked once since boot — the standard trade-off for a session token. Applied to every
 * WRITE; entries already on disk keep their old accessibility until they're rewritten, which
 * happens on the next token refresh.
 */
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * Never let a Keychain failure reject into supabase-js — an unhandled rejection inside the
 * storage adapter leaves auth in an undefined state. `null` means "no session right now"; the
 * stored entry is left untouched, so a later (unlocked) launch restores it normally.
 */
async function readItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    reportWarning('secure-store read failed', {
      key,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const total = await readItem(`${key}_chunks`);
    if (!total) return readItem(key); // fallback for existing single-chunk values
    const count = parseInt(total, 10);
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await readItem(`${key}_chunk_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Small enough — store directly and clear any old chunks
        await SecureStore.setItemAsync(key, value, KEYCHAIN);
        await SecureStore.deleteItemAsync(`${key}_chunks`);
        return;
      }
      // Split into chunks
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i], KEYCHAIN);
      }
      // Write the counter LAST: until it lands, getItem falls back to the single-chunk
      // value, so a half-finished write can never be read as a complete session.
      await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length), KEYCHAIN);
      await SecureStore.deleteItemAsync(key); // remove any old single-chunk value
    } catch (e) {
      reportWarning('secure-store write failed', {
        key,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const total = await readItem(`${key}_chunks`);
      if (total) {
        const count = parseInt(total, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      reportWarning('secure-store remove failed', {
        key,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS !== 'web' ? ExpoSecureStoreAdapter : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});