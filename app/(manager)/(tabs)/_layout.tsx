import { Tabs, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useProfileInvoicesSeenStore, usePendingAppsStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pendingCount = usePendingAppsStore((s) => s.count);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);

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

  // ── Profile tab invoice badge ─────────────────────────────────────────────
  // Badge counts invoices that arrived since the manager last opened the Profile
  // tab. Tapping the Profile tab clears it (per-invoice red dots are separate).
  const profileSeenAt = useProfileInvoicesSeenStore((s) => (currentUser?.id ? s.lastSeen[currentUser.id] : undefined));
  const markProfileInvoicesSeen = useProfileInvoicesSeenStore((s) => s.markProfileInvoicesSeen);
  const [invoiceSentDates, setInvoiceSentDates] = useState<string[]>([]);

  const fetchInvoiceDates = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase.from('invoices').select('sent_at').eq('manager_id', currentUser.id);
    setInvoiceSentDates((data ?? []).map((i: any) => i.sent_at).filter(Boolean));
  }, [currentUser?.id]);

  // First run for this user: anchor "seen" to now so existing invoices don't all badge
  useEffect(() => {
    if (currentUser?.id && !profileSeenAt) markProfileInvoicesSeen(currentUser.id);
  }, [currentUser?.id, profileSeenAt, markProfileInvoicesSeen]);

  useFocusEffect(useCallback(() => { fetchInvoiceDates(); }, [fetchInvoiceDates]));

  // Realtime: refresh when an invoice row changes for this manager
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`invoices-badge-${currentUser.id}-${Date.now()}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'invoices', filter: `manager_id=eq.${currentUser.id}` },
          () => { fetchInvoiceDates(); }
        )
        .subscribe();
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }, [currentUser?.id, fetchInvoiceDates]);

  const invoiceBadge = useMemo(() => {
    if (!profileSeenAt) return 0;
    const seen = new Date(profileSeenAt).getTime();
    return invoiceSentDates.filter((d) => new Date(d).getTime() > seen).length;
  }, [invoiceSentDates, profileSeenAt]);

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
        name="network"
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
          tabBarBadge: invoiceBadge > 0 ? invoiceBadge : undefined,
        }}
        listeners={{
          tabPress: () => { if (currentUser?.id) markProfileInvoicesSeen(currentUser.id); },
        }}
      />
    </Tabs>
  );
}