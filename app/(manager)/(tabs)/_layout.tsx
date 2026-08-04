import { Tabs, useFocusEffect, useRouter, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import { View, Pressable, StyleSheet } from '@/lib/rn';
import { ActionSheetIOS } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useProfileInvoicesSeenStore, usePendingAppsStore, useVenueFilterStore, useCalendarSelectionStore, useCalendarBulkStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { ALLOW_ARTIST_VENUE_APPLICATIONS } from '@/lib/features';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pendingCount = usePendingAppsStore((s) => s.count);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);
  const router = useRouter();
  const pathname = usePathname();
  const venueFilterId = useVenueFilterStore((s) => s.venueId);
  const calendarSelectedDate = useCalendarSelectionStore((s) => s.selectedDate);

  // Center "+" opens the native iOS action sheet. Its callback runs AFTER the sheet dismisses,
  // so each destination then opens with its own proper animation (add-slot's form sheet, a
  // normal slide for create-venue) — no modal-over-modal jank. The Add-Slot date is resolved
  // here (only the tab layout knows which tab we're on): calendar → its selected day, else today.
  const openQuickActions = () => {
    const today = new Date().toISOString().slice(0, 10);
    const date = pathname?.includes('calendar') ? (calendarSelectedDate || today) : today;
    const venueQ = venueFilterId ? '&venueId=' + venueFilterId : '';
    // "Add Multiple Slots" (bulk) was removed — recurring nights now come from each venue's
    // weekly programme (the Schedule tab). One-off nights still use Add Slot.
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Add Slot', 'Create Venue', 'Cancel'], cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) router.push(('/(manager)/add-slot?date=' + date + venueQ) as Href);
        else if (i === 1) router.push('/(manager)/create-venue' as Href);
      }
    );
  };

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
        name="create-action"
        options={{
          title: '',
          tabBarButton: () => (
            <Pressable
              onPress={openQuickActions}
              style={fabStyles.btn}
              accessibilityRole="button"
              accessibilityLabel="Quick actions"
            >
              <View style={[fabStyles.circle, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="add" size={30} color="#fff" />
              </View>
            </Pressable>
          ),
        }}
      />
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

const fabStyles = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
});
