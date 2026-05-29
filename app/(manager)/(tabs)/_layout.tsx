import { Tabs, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!currentUser?.id) return;
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', currentUser.id)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [currentUser?.id]));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <MaterialIcons name="dashboard" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <MaterialIcons name="calendar-today" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Network',
          tabBarIcon: ({ color }) => <MaterialIcons name="people" size={24} color={color} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="lineup" options={{ href: null }} />
      <Tabs.Screen name="venues" options={{ href: null }} />
      <Tabs.Screen name="team" options={{ href: null }} />
    </Tabs>
  );
}