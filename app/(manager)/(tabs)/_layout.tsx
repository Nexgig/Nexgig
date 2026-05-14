import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Platform } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAuthStore, useInvoiceStore } from '@/lib/store';

export default function ManagerTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);
  const unreadInvoiceCount = useMemo(() => {
    if (!currentUser) return 0;
    return invoices.filter((inv) => inv.managerId === currentUser.id && !inv.isReadByManager).length;
  }, [invoices, currentUser?.id]);

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
        name="team"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
          tabBarBadge: unreadInvoiceCount > 0 ? unreadInvoiceCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF6B35', fontSize: 10, minWidth: 16, height: 16 },
        }}
      />
      {/* Hidden legacy screens — keep files for navigation but exclude from tab bar */}
      <Tabs.Screen name="venues" options={{ href: null }} />
      <Tabs.Screen name="lineup" options={{ href: null }} />
    </Tabs>
  );
}
