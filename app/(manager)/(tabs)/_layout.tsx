import { Tabs, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    if (!currentUser?.id) return;
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', currentUser.id)
      .eq('status', 'pending');
    setPendingCount(count ?? 0);
  }, [currentUser?.id]);

  useFocusEffect(useCallback(() => {
    fetchPendingCount();
  }, [fetchPendingCount]));

  // Realtime: update badge instantly when an application changes
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`apps-badge-${currentUser.id}-${Date.now()}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'applications', filter: `manager_id=eq.${currentUser.id}` },
          () => { fetchPendingCount(); }
        )
        .subscribe();
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }, [currentUser?.id, fetchPendingCount]);

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