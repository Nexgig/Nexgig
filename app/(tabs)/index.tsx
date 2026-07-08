import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from '@/lib/rn';
import { useRouter, Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

export default function IndexScreen() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // The auth store is persisted and hydrates from AsyncStorage asynchronously.
  // Until that finishes, currentUser is null even for a signed-in user, so
  // deciding now would briefly redirect signed-in users toward the (cream)
  // Welcome screen before snapping to their dashboard. Wait for hydration first.
  const [authHydrated, setAuthHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  useEffect(() => {
    if (authHydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setAuthHydrated(true));
    // Safety: if hydration already completed between render and subscribe.
    if (useAuthStore.persist.hasHydrated()) setAuthHydrated(true);
    return unsub;
  }, [authHydrated]);

  if (!authHydrated) {
    // Splash is still up at this point (root layout holds it until auth hydrates),
    // so this renders behind it. Themed background as a safe fallback.
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!isAuthenticated || !currentUser) {
    return <Redirect href={'/(auth)/welcome' as Href} />;
  }

  if (currentUser.accountType === 'manager') {
    return <Redirect href={'/(manager)/(tabs)/dashboard' as Href} />;
  }

  if (currentUser.accountType === 'artist') {
    return <Redirect href={'/(artist)/(tabs)/dashboard' as Href} />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
