import { Tabs, useFocusEffect, useRouter, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Modal } from '@/lib/rn';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useProfileInvoicesSeenStore, usePendingAppsStore, useVenueFilterStore, useCalendarSelectionStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { ALLOW_ARTIST_VENUE_APPLICATIONS } from '@/lib/features';

export default function ManagerTabsLayout() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pendingCount = usePendingAppsStore((s) => s.count);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const venueFilterId = useVenueFilterStore((s) => s.venueId);
  const calendarSelectedDate = useCalendarSelectionStore((s) => s.selectedDate);

  // Add Slot from the center "+": on the calendar it lands on the day selected there; elsewhere
  // it uses today. Carries the shared venue filter through as the preselected venue.
  const handleAddSlot = () => {
    setActionSheetOpen(false);
    const today = new Date().toISOString().slice(0, 10);
    const date = pathname?.includes('calendar') ? (calendarSelectedDate || today) : today;
    router.push(('/(manager)/add-slot?date=' + date + (venueFilterId ? '&venueId=' + venueFilterId : '')) as Href);
  };
  const handleCreateVenue = () => {
    setActionSheetOpen(false);
    router.push('/(manager)/create-venue' as Href);
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
    <>
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
              onPress={() => setActionSheetOpen(true)}
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

    <Modal visible={actionSheetOpen} transparent animationType="slide" onRequestClose={() => setActionSheetOpen(false)}>
      <Pressable style={fabStyles.overlay} onPress={() => setActionSheetOpen(false)}>
        <Pressable
          style={[fabStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={[fabStyles.handle, { backgroundColor: colors.border }]} />
          <ActionRow icon="event" label="Add Slot" colors={colors} onPress={handleAddSlot} />
          <ActionRow icon="add-business" label="Create Venue" colors={colors} onPress={handleCreateVenue} />
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function ActionRow({ icon, label, colors, onPress }: {
  icon: any; label: string; colors: ReturnType<typeof useColors>; onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [fabStyles.row, { opacity: pressed ? 0.6 : 1 }]} onPress={onPress}>
      <View style={[fabStyles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={[fabStyles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
});