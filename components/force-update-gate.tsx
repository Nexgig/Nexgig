import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking } from '@/lib/rn';
import * as Updates from 'expo-updates';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';

// Where "Update Now" sends people. iOS is live; the Android link is harmless until Play launches.
const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/ae/app/nexgig/id6784020757',
  android: 'https://play.google.com/store/apps/details?id=com.nexgig.app',
  default: 'https://apps.apple.com/ae/app/nexgig/id6784020757',
}) as string;

// True if version `a` is strictly lower than `b`. Handles "1.1" vs "1.0.0" vs "1.2" (mixed lengths).
function versionLt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/**
 * Blocking "Update required" gate. On launch it reads the minimum required version from the
 * Supabase `app_config` row and compares it to THIS build's native version (Updates.runtimeVersion,
 * which equals the app version under the appVersion runtime policy). If the installed app is older,
 * it covers the whole app with a non-dismissible screen pointing at the store.
 *
 * FAILS OPEN by design: a null version (dev/Expo Go), a missing row, a fetch error, or an
 * unparseable value all mean "don't block" — so a config typo or a Supabase outage can never lock
 * every user out of the app.
 */
export function ForceUpdateGate() {
  const colors = useColors();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = Updates.runtimeVersion; // = the native app version (e.g. "1.1")
        if (!current) return; // dev / Expo Go — never gate
        const col = Platform.OS === 'android' ? 'min_android_version' : 'min_ios_version';
        const { data, error } = await supabase.from('app_config').select(col).maybeSingle();
        if (cancelled || error || !data) return;
        const min = (data as Record<string, unknown>)[col];
        if (typeof min === 'string' && min && versionLt(current, min)) setBlocked(true);
      } catch {
        // fail open — never block on an error
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!blocked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
        <MaterialIcons name="system-update" size={40} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Update Required</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        A new version of Nexgig is available. Please update to keep using the app.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        onPress={() => Linking.openURL(STORE_URL).catch(() => {})}
      >
        <Text style={styles.btnText}>Update Now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  iconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontFamily: fonts.bodyBold, letterSpacing: -0.4, marginBottom: 8 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28, maxWidth: 300 },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, minWidth: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
