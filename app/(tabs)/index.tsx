import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

export default function IndexScreen() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || !currentUser) {
    return <Redirect href={'/(auth)/welcome' as Href} />;
  }

  if (currentUser.accountType === 'manager') {
    return <Redirect href={'/(manager)/(tabs)/dashboard' as Href} />;
  }

  if (currentUser.accountType === 'artist') {
    return <Redirect href={'/(artist)/(tabs)/home' as Href} />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
