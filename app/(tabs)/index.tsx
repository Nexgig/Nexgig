import { useEffect, useState } from 'react';
import { View } from '@/lib/rn';
import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

export default function IndexScreen() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // The auth store is persisted and hydrates from AsyncStorage asynchronously.
  // Until it finishes, currentUser is null even for a signed-in user — so
  // deciding now would aim at the Welcome screen first, then correct. Wait for
  // hydration so we redirect exactly once, to the right place. The splash is held
  // up (root layout) until this resolves, so nothing here is ever seen.
  const [authHydrated, setAuthHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  useEffect(() => {
    if (authHydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setAuthHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setAuthHydrated(true);
    return unsub;
  }, [authHydrated]);

  // Render nothing (behind the splash) until we know where to go.
  if (!authHydrated) {
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

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
