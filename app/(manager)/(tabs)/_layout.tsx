import { Tabs, useFocusEffect, useRouter, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { ActionSheetIOS } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useProfileInvoicesSeenStore, usePendingAppsStore, useVenueFilterStore, useCalendarSelectionStore, useCalendarBulkStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { ALLOW_ARTIST_VENUE_APPLICATIONS } from '@/lib/features';

// Icon + label per tab. `create-action` is the center + and is rendered specially.
const TAB_META: Record<string, { icon: any; label: string }> = {
  dashboard: { icon: 'dashboard', label: 'Dashboard' },
  calendar: { icon: 'calendar-today', label: 'Calendar' },
  network: { icon: 'people', label: 'Roster' },
  profile: { icon: 'person', label: 'Profile' },
};

export default function ManagerTabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
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

  // Custom, flat tab bar (no shadow): active tab = coral 12%-tint capsule with icon + label;
  // inactive = 25px icon only. Center + keeps the quick-actions FAB.
  const renderTabBar = ({ state, navigation }: any) => (
    <View style={[tabStyles.bar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;

        if (route.name === 'create-action') {
          return (
            <Pressable key={route.key} onPress={openQuickActions} style={tabStyles.item} accessibilityRole="button" accessibilityLabel="Quick actions">
              <View style={[tabStyles.fabCircle, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="add" size={30} color="#fff" />
              </View>
            </Pressable>
          );
        }

        const meta = TAB_META[route.name];
        if (!meta) return null;
        const badge = route.name === 'network' ? pendingCount : route.name === 'profile' ? invoiceBadge : 0;

        const onPress = () => {
          if (route.name === 'profile' && currentUser?.id) markProfileInvoicesSeen(currentUser.id);
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        const icon = (
          <View>
            <MaterialIcons name={meta.icon} size={25} color={focused ? colors.primary : colors.muted} />
            {badge > 0 && (
              <View style={[tabStyles.badge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                <Text style={tabStyles.badgeText}>{badge}</Text>
              </View>
            )}
          </View>
        );

        return (
          <Pressable key={route.key} onPress={onPress} style={tabStyles.item} accessibilityRole="button" accessibilityState={{ selected: focused }}>
            {focused ? (
              <View style={[tabStyles.pill, { backgroundColor: colors.primary + '1F' }]}>
                {icon}
                <Text style={[tabStyles.pillLabel, { color: colors.primary }]}>{meta.label}</Text>
              </View>
            ) : (
              icon
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="create-action" />
      <Tabs.Screen name="network" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  item: { alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  pillLabel: { fontSize: 15, fontWeight: '700' },
  fabCircle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
