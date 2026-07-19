import { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, Alert, ActivityIndicator } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { useAuthStore } from '@/lib/store';
import { rolesAvailable, switchRole, type Role } from '@/lib/roles';
import { ALLOW_DUAL_ROLE } from '@/lib/features';

/**
 * The profile screen's role heading — "Manager" / "Artist" — as a control.
 *
 * A bare tappable word gives no clue it does anything, so this renders as a pill with a
 * switch icon. With ALLOW_DUAL_ROLE off, or on an account that only has one profile, it
 * falls back to the plain heading it replaced and nothing changes.
 */
export function RoleSwitcher({ role }: { role: Role }) {
  const colors = useColors();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [other, setOther] = useState<'has' | 'none' | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);

  const otherRole: Role = role === 'manager' ? 'artist' : 'manager';
  const otherLabel = otherRole === 'manager' ? 'Manager' : 'Artist';

  useEffect(() => {
    if (!ALLOW_DUAL_ROLE || !currentUser?.email) return;
    let cancelled = false;
    rolesAvailable(currentUser.email).then((r) => {
      if (!cancelled) setOther(r[otherRole] ? 'has' : 'none');
    });
    return () => { cancelled = true; };
  }, [currentUser?.email, otherRole]);

  const label = role === 'manager' ? 'Manager' : 'Artist';

  // Plain heading when the feature is off — identical to what was here before.
  if (!ALLOW_DUAL_ROLE) {
    return <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>;
  }

  const go = async () => {
    if (busy) return;
    if (other === 'none') {
      Alert.alert(
        `Set up your ${otherLabel.toLowerCase()} profile`,
        `You'll fill in a few details, then you can switch between ${label.toLowerCase()} and ${otherLabel.toLowerCase()} any time.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => router.push((otherRole === 'manager'
              // resume=1: the account already exists, so the wizard skips sign-up and
              // writes only the profile row.
              ? '/(auth)/manager-register?resume=1'
              : '/(auth)/artist-setup?resume=1') as Href),
          },
        ]
      );
      return;
    }
    setBusy(true);
    const ok = await switchRole(otherRole);
    setBusy(false);
    if (!ok) {
      Alert.alert('Could not switch', `We couldn't open your ${otherLabel.toLowerCase()} profile. Check your connection and try again.`);
      return;
    }
    router.replace((otherRole === 'manager'
      ? '/(manager)/(tabs)/dashboard'
      : '/(artist)/(tabs)/dashboard') as Href);
  };

  return (
    <Pressable
      onPress={go}
      disabled={busy || other === 'unknown'}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={other === 'none' ? `Set up your ${otherLabel} profile` : `Switch to ${otherLabel}`}
      style={({ pressed }) => [styles.pill, { backgroundColor: colors.primary + '15', opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
      {busy
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <MaterialIcons name={other === 'none' ? 'add' : 'swap-horiz'} size={20} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start', paddingLeft: 12, paddingRight: 10,
    paddingVertical: 4, borderRadius: 999,
  },
});
