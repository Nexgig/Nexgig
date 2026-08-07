import { Tabs, useFocusEffect } from 'expo-router';
import { View, Text } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useProfileInvoicesSeenStore, usePendingAppsStore, useDraftStore, useSlotStore, useInvoiceStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { isPastStart } from '@/lib/utils';
import { ALLOW_ARTIST_VENUE_APPLICATIONS } from '@/lib/features';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pendingCount = usePendingAppsStore((s) => s.count);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);

  const fetchPendingCount = useCallback(async () => {
    // Artists can't apply any more, and the Accept/Decline inbox is hidden with them —
    // a badge would point at a screen with nothing to act on. Existing pending rows are
    // left in the DB; flipping the flag back brings both the badge and the inbox back.
    if (!ALLOW_ARTIST_VENUE_APPLICATIONS) { setPendingCount(0); return; }
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
    // No new applications can ever arrive — don't hold a channel open for them.
    if (!ALLOW_ARTIST_VENUE_APPLICATIONS) return;
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

  // Badge = invoices the manager RECEIVED but hasn't OPENED yet (clears per-invoice as each is
  // opened), not "new since last profile visit". Reads the merged read-state from the store.
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const invoiceBadge = useMemo(
    () => allInvoices.filter((inv) => inv.managerId === currentUser?.id && !inv.isReadByManager && inv.status !== 'cancelled' && !inv.isDeletedByManager).length,
    [allInvoices, currentUser?.id]
  );

  // ── Calendar tab badge: unsent gigs ───────────────────────────────────────
  // Count the manager's drafts (staged, not sent) on FUTURE slots — the same set
  // the calendar's "Send N" button sends. Filter-independent, so it's the total
  // "you have unsent gigs" number (equals Send N when the filter is All Venues).
  const drafts = useDraftStore((s) => s.drafts);
  const slots = useSlotStore((s) => s.slots);
  const draftBadge = useMemo(() => {
    if (!currentUser?.id) return 0;
    return drafts.filter((d) => {
      if (d.managerId !== currentUser.id) return false;
      const slot = slots.find((s) => s.id === d.slotId);
      if (!slot) return false;
      return !isPastStart(slot.date, slot.startTime);
    }).length;
  }, [drafts, slots, currentUser?.id]);

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
          // Custom coral badge sitting BESIDE the icon (offset right) instead of the default
          // red one that hugs the corner and overlaps the glyph.
          tabBarIcon: ({ color }) => (
            <View>
              <MaterialIcons name="calendar-today" size={24} color={color} />
              {draftBadge > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -15, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{draftBadge}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen name="create-action" options={{ href: null }} />
      <Tabs.Screen
        name="network"
        options={{
          title: 'Roster',
          tabBarIcon: ({ color }) => <MaterialIcons name="people" size={24} color={color} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          // Custom coral badge beside the icon — same style as the Calendar tab (not the default red).
          tabBarIcon: ({ color }) => (
            <View>
              <MaterialIcons name="person" size={24} color={color} />
              {invoiceBadge > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -15, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{invoiceBadge}</Text>
                </View>
              )}
            </View>
          ),
        }}
        listeners={{
          tabPress: () => { if (currentUser?.id) markProfileInvoicesSeen(currentUser.id); },
        }}
      />
    </Tabs>
  );
}
