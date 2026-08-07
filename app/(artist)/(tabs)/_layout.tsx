import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Platform, View, Text, StyleSheet } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';
import { useAuthStore, useBookingStore, useNotificationStore, useNetworkSeenStore } from '@/lib/store';
import { SHOW_ARTIST_DIRECTORY } from '@/lib/features';
import { useMemo } from 'react';

function CalendarTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);

  const calendarActionableCount = useMemo(() => {
    return allBookings.filter(
      (b) =>
        b.artistId === currentUser?.id &&
        !b.hiddenFromCalendar &&
        !b.cancelledAsRequest &&
        (
          b.status === 'requested' ||
          b.status === 'past_confirmation' ||
          (b.status === 'cancelled' && !b.cancellationAcknowledged && !b.cancelledByArtist)
        )
    ).length;
  }, [allBookings, currentUser?.id]);

  return (
    <View style={styles.iconWrap}>
      <IconSymbol size={26} name="calendar" color={color} />
      {calendarActionableCount > 0 && (
        <View style={[styles.badgeWrap, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{calendarActionableCount > 99 ? '99+' : calendarActionableCount}</Text>
        </View>
      )}
    </View>
  );
}

function NetworkTabIcon({ color }: { color: string; focused: boolean }) {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const notifications = useNotificationStore((s) => s.notifications);
  const lastSeenMap = useNetworkSeenStore((s) => s.lastSeen);

  const hasNew = useMemo(() => {
    if (!currentUser?.id) return false;
    const lastSeen = lastSeenMap[currentUser.id];
    const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
    const NETWORK_TYPES = ['lineup_added', 'venue_assigned', 'lineup_accepted'];
    return notifications.some(
      (n) =>
        n.userId === currentUser.id &&
        NETWORK_TYPES.includes(n.type) &&
        new Date(n.createdAt).getTime() > lastSeenTime
    );
  }, [notifications, lastSeenMap, currentUser?.id]);

  return (
    <View style={styles.iconWrap}>
      <IconSymbol size={26} name="storefront" color={color} />
      {hasNew && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
    </View>
  );
}

export default function DJTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => <CalendarTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          // The route file stays `network.tsx` (renaming it would break every push
          // deep-link and router.push in the app); it now renders the Venues list.
          title: 'Venues',
          tabBarIcon: ({ color, focused }) => <NetworkTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badgeWrap: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});