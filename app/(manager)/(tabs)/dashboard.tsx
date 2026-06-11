import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Animated, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { isPastStart, isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function ManagerDashboard() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  const bookings = useMemo(
    () => allBookings.filter((b) => b.managerId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const nowDT = nowLocalDateTimeStr();

  const upcomingBookings = useMemo(() => bookings
    .filter((b) => b.status === 'confirmed')
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      // Null artist_id means the artist deleted their account → show "Former Artist".
      const dj = b.artistId == null
        ? { fullName: 'Former Artist', profilePhotoUrl: undefined }
        : artistUsers.find((u) => u.id === b.artistId);
      const venue = allVenues.find((v) => v.id === b.venueId);
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId, venueId: b.venueId, date: b.slotDate,
        name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
        endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
      } : undefined);
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue };
    })
    .filter((b) => b.slot && isUpcoming(b.slot.date, b.slot.startTime))
    .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1)
    .slice(0, 5),
    [bookings, slots, artistUsers, allVenues, nowDT]
  );

  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    const { data } = await supabase.from('bookings').select('*').eq('manager_id', currentUser.id);
    if (data) {
      clearBookings();
      data.forEach((b: any) => addBooking({
        id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
        managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
        confirmedAt: b.confirmed_at ?? undefined, cancelledAt: b.cancelled_at ?? undefined,
        cancellationReason: b.cancellation_reason ?? undefined,
        cancellationAcknowledged: b.cancellation_acknowledged ?? false,
        cancelledAsRequest: b.cancelled_as_request ?? false,
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
        venueName: b.venue_name ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    setRefreshing(false);
  }, [currentUser?.id]);

  // Auto-complete confirmed bookings whose slot start time has passed
  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        // Use live slot first, fall back to booking's own snapshot
        const slotDate = slot?.date ?? b.slotDate;
        const slotStart = slot?.startTime ?? b.slotStartTime;
        if (slotDate && slotStart && isPastStart(slotDate, slotStart)) {
          const venue = allVenues.find((v) => v.id === b.venueId);
          updateBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: slot?.date ?? b.slotDate,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: slot?.startTime ?? b.slotStartTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
          syncBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: slot?.date ?? b.slotDate,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: slot?.startTime ?? b.slotStartTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
        }
      });
  }, [bookings, slots, nowDT, updateBookingStatus, allVenues]);

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'requested' || b.status === 'past_confirmation').length,
    [bookings]
  );

  const completedCount = useMemo(
    () => bookings.filter((b) => b.status === 'completed').length,
    [bookings]
  );

  const globalLineup = useLineupStore((s) => s.globalLineup);
  const artistsCount = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active').length,
    [globalLineup, currentUser?.id]
  );

  const completedBookings = useMemo(() => bookings
    .filter((b) => b.status === 'completed' || b.isCompleted)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      // Null artist_id means the artist deleted their account → show "Former Artist".
      const dj = b.artistId == null
        ? { fullName: 'Former Artist', profilePhotoUrl: undefined }
        : artistUsers.find((u) => u.id === b.artistId);
      const venue = allVenues.find((v) => v.id === b.venueId);
      // Use live slot/venue if available, otherwise fall back to snapshot stored on the booking
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId,
        venueId: b.venueId,
        date: b.slotDate,
        name: b.slotName ?? '',
        startTime: b.slotStartTime ?? '',
        endTime: b.slotEndTime ?? '',
        createdAt: b.createdAt,
      } : undefined);
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue };
    })
    .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1),
    [bookings, slots, artistUsers, allVenues]
  );

  // Group completed bookings by month with full booking details
  const completedByMonth = useMemo(() => {
    const map: Record<string, typeof completedBookings> = {};
    completedBookings.forEach((b) => {
      const dateStr = b.slot?.date;
      if (!dateStr) return; // no date info at all — skip
      const d = new Date(dateStr);
      const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    // Sort months descending
    return Object.entries(map).sort((a, b) => {
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    });
  }, [completedBookings]);

  const [completedOpen, setCompletedOpen] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [fabSheetOpen, setFabSheetOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const fabRotation = useRef(new Animated.Value(0)).current;

  const toggleFab = (open: boolean) => {
    setFabSheetOpen(open);
    Animated.timing(fabRotation, {
      toValue: open ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const fabRotateStyle = {
    transform: [{
      rotate: fabRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '45deg'],
      }),
    }],
  };

  const toggleMonth = useCallback((month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }, []);

  // Venues that appear in completed bookings (for filter chips)
  const completedVenueList = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    completedBookings.forEach((b) => {
      const venueId = b.venue?.id ?? b.venueId;
      const venueName = b.venue?.name ?? b.venueName;
      if (venueId && venueName && !seen.has(venueId)) {
        seen.add(venueId);
        list.push({ id: venueId, name: venueName });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [completedBookings]);

  // Filtered completed bookings by selected venue
  const filteredCompletedBookings = useMemo(() => {
    if (!selectedVenueId) return completedBookings;
    return completedBookings.filter((b) => (b.venue?.id ?? b.venueId) === selectedVenueId);
  }, [completedBookings, selectedVenueId]);

  // Group filtered bookings by month
  const filteredByMonth = useMemo(() => {
    const map: Record<string, typeof filteredCompletedBookings> = {};
    filteredCompletedBookings.forEach((b) => {
      const dateStr = b.slot?.date;
      if (!dateStr) return; // no date info at all — skip
      const d = new Date(dateStr);
      const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return Object.entries(map).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [filteredCompletedBookings]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const tabBarHeight = 56 + Math.max(insets.bottom, 8);

  const fabActions = [
    { icon: 'add-business' as const, label: 'New Venue', onPress: () => { setFabSheetOpen(false); router.push('/(manager)/create-venue' as Href); } },
    { icon: 'people' as const, label: 'Find Artists', onPress: () => { setFabSheetOpen(false); router.push('/(manager)/(tabs)/explore?tab=artists' as Href); } },
    { icon: 'event' as const, label: 'Add Set', onPress: () => { setFabSheetOpen(false); router.push('/(manager)/(tabs)/calendar' as Href); } },
  ];

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: colors.muted }]}>{greeting}</Text>
            <Text style={[styles.name, { color: colors.foreground }]}>{currentUser?.fullName?.split(' ')[0] ?? 'Manager'}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={[styles.notifBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/(manager)/notifications' as Href)}
            >
              <MaterialIcons name="notifications" size={22} color={colors.foreground} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="CONFIRMED"
            value={upcomingBookings.filter((b) => b.status === 'confirmed').length}
            color={colors.success}
            colors={colors}
            onPress={() => router.push('/(manager)/confirmed-bookings' as Href)}
          />
          <SummaryCard
            label="PENDING"
            value={pendingCount}
            color={colors.warning}
            colors={colors}
            onPress={() => router.push('/(manager)/pending-requests' as Href)}
          />
          <SummaryCard
            label="COMPLETED"
            value={completedCount}
            color={colors.primary}
            colors={colors}
            onPress={() => router.push('/(manager)/completed-gigs' as Href)}
          />
        </View>

        {/* Confirmed Bookings */}
        <View style={styles.section}>
          <SectionHeader
            title="Confirmed Bookings"
            actionLabel="See all"
            onAction={() => router.push('/(manager)/confirmed-bookings' as Href)}
          />
          {upcomingBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No upcoming bookings</Text>
            </View>
          ) : (
            upcomingBookings.map((booking) => (
              <Pressable
                key={booking.id}
                style={({ pressed }) => [styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
              >
                <View style={styles.bookingCardLeft}>
                  {booking.dj?.profilePhotoUrl ? (
                    <Image source={{ uri: booking.dj.profilePhotoUrl }} style={styles.djPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.djPhoto, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                      <MaterialIcons name="person" size={22} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.bookingInfo}>
                    <Text style={[styles.bookingDJ, { color: colors.foreground }]} numberOfLines={1}>{booking.dj?.fullName ?? 'Unknown Artist'}</Text>
                    <Text style={[styles.bookingVenue, { color: colors.muted }]} numberOfLines={1}>{booking.venue?.name ?? 'Unknown Venue'}</Text>
                    <Text style={[styles.bookingTime, { color: colors.muted }]}>
                      {booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
                    </Text>
                  </View>
                </View>
                <StatusBadge status={booking.status} />
              </Pressable>
            ))
          )}
        </View>

        {/* Nexgig */}
        <View style={styles.section}>
          <Pressable
            style={[styles.collapseHeader, { borderColor: colors.border }]}
            onPress={() => setCompletedOpen((v) => !v)}
          >
            <View style={styles.collapseHeaderLeft}>
               <Text style={[styles.collapseTitle, { color: colors.foreground }]}>History</Text>
            </View>
            <MaterialIcons
              name={completedOpen ? 'expand-less' : 'expand-more'}
              size={22}
              color={colors.muted}
            />
          </Pressable>
          {completedOpen && (
            <>
              {/* Venue filter chips */}
              {completedVenueList.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.venueChipRow}
                  style={{ marginBottom: 12 }}
                >
                  <Pressable
                    style={[styles.venueChip, !selectedVenueId && { backgroundColor: colors.foreground }]}
                    onPress={() => setSelectedVenueId(null)}
                  >
                    <Text style={[styles.venueChipText, { color: !selectedVenueId ? colors.background : colors.foreground }]}>All</Text>
                  </Pressable>
                  {completedVenueList.map((v) => (
                    <Pressable
                      key={v.id}
                      style={[styles.venueChip, selectedVenueId === v.id && { backgroundColor: colors.foreground }]}
                      onPress={() => setSelectedVenueId(v.id)}
                    >
                      <Text style={[styles.venueChipText, { color: selectedVenueId === v.id ? colors.background : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {filteredByMonth.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="check-circle" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No completed bookings yet</Text>
              </View>
            ) : (
              <View style={[styles.monthTable, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {filteredByMonth.map(([month, monthBookings], idx) => {
                  const isExpanded = expandedMonth === month;
                  return (
                    <View key={month}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.monthRow,
                          { borderTopColor: colors.border, opacity: pressed ? 0.75 : 1 },
                          idx === 0 && { borderTopWidth: 0 },
                        ]}
                        onPress={() => toggleMonth(month)}
                      >
                        <MaterialIcons name="calendar-today" size={14} color={colors.muted} style={{ marginRight: 8 }} />
                        <Text style={[styles.monthLabel, { color: colors.foreground }]}>{month}</Text>
                        <View style={[styles.monthBadge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30', marginRight: 8 }]}>
                          <Text style={[styles.monthBadgeText, { color: colors.primary }]}>{monthBookings.length}</Text>
                        </View>
                        <MaterialIcons
                          name={isExpanded ? 'expand-less' : 'expand-more'}
                          size={18}
                          color={colors.muted}
                        />
                      </Pressable>
                      {isExpanded && monthBookings.map((booking, bIdx) => (
                        <Pressable
                          key={booking.id}
                          style={({ pressed }) => [styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                          onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
                        >
                          <View style={styles.bookingSubLeft}>
                            <View style={[styles.bookingSubAvatar, { backgroundColor: colors.primary + '20' }]}>
                              <Text style={[styles.bookingSubAvatarText, { color: colors.primary }]}>
                                {(booking.dj?.fullName ?? '?')[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.bookingSubInfo}>
                              <Text style={[styles.bookingSubName, { color: colors.foreground }]} numberOfLines={1}>
                                {booking.dj?.fullName ?? 'Unknown Artist'}
                              </Text>
                              <Text style={[styles.bookingSubDetail, { color: colors.muted }]} numberOfLines={1}>
                                {booking.venue?.name ?? booking.venueName ?? 'Unknown Venue'}
                                {booking.slot?.date ? ` · ${formatDate(booking.slot.date)}` : ''}
                              </Text>
                            </View>
                          </View>
                          <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
          </>
          )}
        </View>

      </ScrollView>

      {/* FAB */}
      <Pressable
        style={[styles.fabWrapper, { bottom: 24 }]}
        onPress={() => toggleFab(!fabSheetOpen)}
      >
        <LinearGradient
          colors={['#3D7EE8', '#1A56C4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fab}
        >
          <Animated.View style={fabRotateStyle}>
            <MaterialIcons name="add" size={24} color="rgba(255,255,255,0.95)" />
          </Animated.View>
        </LinearGradient>
      </Pressable>

      {/* FAB Popup Menu */}
      {fabSheetOpen && (
        <>
          {/* Backdrop */}
          <Pressable style={styles.fabOverlay} onPress={() => toggleFab(false)} />
          {/* Popup card above FAB */}
          <View style={[styles.fabPopup, { backgroundColor: colors.surface, borderColor: colors.border, bottom: 24 + 50 + 12, right: 24 }]}>
            {fabActions.map((action, idx) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.fabPopupRow,
                  { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  idx === 0 && { borderTopWidth: 0 },
                ]}
                onPress={action.onPress}
              >
                <View style={[styles.fabPopupIcon, { backgroundColor: colors.primary + '18' }]}>
                  <MaterialIcons name={action.icon} size={20} color={colors.primary} />
                </View>
                <Text style={[styles.fabPopupLabel, { color: colors.foreground }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function SummaryCard({ label, value, color, colors, onPress, zeroAction }: {
  label: string; value: number; color: string; onPress?: () => void; zeroAction?: () => void;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
}) {
  const showPlus = value === 0 && !!zeroAction;
  const handlePress = showPlus ? zeroAction : onPress;
  return (
    <Pressable
      style={({ pressed }) => [styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed && handlePress ? 0.8 : 1 }]}
      onPress={handlePress}
    >
      <Text style={[styles.summaryValue, { color }]}>{showPlus ? '+' : value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}



const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerLeft: {},
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 13, marginBottom: 2 },
  name: { fontSize: 22, fontWeight: '800' },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  summaryCard: { flex: 1, minWidth: '28%', borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { marginBottom: 28 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  bookingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  bookingCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  djPhoto: { width: 44, height: 44, borderRadius: 12 },
  bookingInfo: { flex: 1 },
  bookingDJ: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  bookingVenue: { fontSize: 13, marginBottom: 2 },
  bookingTime: { fontSize: 12 },
  fabWrapper: { position: 'absolute', right: 24, width: 50, height: 50, borderRadius: 25, shadowColor: '#1A56C4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10 },
  fab: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  fabOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  fabPopup: { position: 'absolute', borderRadius: 16, borderWidth: 1, minWidth: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 12, overflow: 'hidden' },
  fabPopupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 0.5 },
  fabPopupIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fabPopupLabel: { fontSize: 15, fontWeight: '600' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 16, fontWeight: '700' },
  collapseBadge: { marginLeft: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collapseBadgeText: { fontSize: 12, fontWeight: '600' },
  monthTable: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 0.5 },
  monthLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  monthBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  monthBadgeText: { fontSize: 13, fontWeight: '700' },
  bookingSubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5 },
  bookingSubLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bookingSubAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bookingSubAvatarText: { fontSize: 14, fontWeight: '700' },
  bookingSubInfo: { flex: 1 },
  bookingSubName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  bookingSubDetail: { fontSize: 12 },
  venueChipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  venueChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, borderColor: 'transparent' },
  venueChipText: { fontSize: 13, fontWeight: '600' },
});
