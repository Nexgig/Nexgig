import { Tabs, useFocusEffect, router } from 'expo-router';
import { View, Text, Pressable } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, usePendingAppsStore, useDraftStore, useSlotStore, useInvoiceStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { isPastStart } from '@/lib/utils';
import { ALLOW_ARTIST_VENUE_APPLICATIONS } from '@/lib/features';
import { useSendSheetStore } from '@/lib/send-sheet';

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

  // ── Roster tab badge: unread invoices received ────────────────────────────
  // Invoices the manager has RECEIVED but not yet opened (isReadByManager). Shown on the ROSTER tab
  // now — the Profile tab no longer carries it, since invoices live on each artist's profile.
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

  // The "Requests" tab is an action: open the calendar's send sheet from anywhere.
  const requestSend = useSendSheetStore((s) => s.requestOpen);
  const handleSendPress = () => {
    requestSend();
    router.navigate('/(manager)/(tabs)/calendar');
  };

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
        name="send"
        options={{
          title: 'Requests',
          // An ACTION tab, not a screen (see send.tsx): the button opens the calendar's send sheet.
          // Carries the unsent-drafts badge (moved here off the Calendar tab).
          tabBarButton: () => (
            <Pressable onPress={handleSendPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <View>
                  <MaterialIcons name="outgoing-mail" size={24} color={colors.muted} />
                  {draftBadge > 0 && (
                    <View style={{ position: 'absolute', top: -5, right: -9, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{draftBadge}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3, fontWeight: '500' }}>Requests</Text>
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: 'Roster',
          // Custom coral badge beside the icon — unread invoices received (same style as Calendar).
          tabBarIcon: ({ color }) => (
            <View>
              <MaterialIcons name="people" size={24} color={color} />
              {invoiceBadge > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -15, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{invoiceBadge}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
