import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * OPS-ONLY telemetry (not user-facing): stamp the running app version onto the user's row so
 * one query shows who's on an old bundle. Writes the same values the Settings footer displays —
 * `Updates.runtimeVersion` (the native shell, e.g. "1.1") + `Updates.updateId` (the OTA bundle) —
 * plus the platform and a last-seen timestamp.
 *
 * Fire-and-forget: any failure is swallowed (this must never block launch or surface an error).
 * In dev the JS is served by Metro so `updateId` is null — that's a valid signal (on Metro/dev).
 * Call once per launch after the user is known.
 */
export async function recordAppVersion(userId: string): Promise<void> {
  try {
    await supabase.from('users').update({
      app_runtime_version: Updates.runtimeVersion ?? null,
      last_update_id: Updates.updateId ?? null,
      app_platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    }).eq('id', userId);
  } catch {
    // telemetry only — ignore
  }
}
