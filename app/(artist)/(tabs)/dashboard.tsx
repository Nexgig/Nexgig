import { useMemo, useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Image, RefreshControl } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { Wordmark } from '@/components/wordmark';
import { MaterialIcons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore, useNotificationStore, useInvoiceStore, useInvoiceReminderStore, venuePhotoUri } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { isPastStart, isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function DJHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allLineups = useLineupStore((s) => s.lineups);
  const allVenueAssignments = useLineupStore((s) => s.venueAssignments);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const getReminder = useInvoiceReminderStore((s) => s.getReminder);

  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    const { data } = await supabase.from('bookings').select('*').eq('artist_id', currentUser.id);
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
        isArtistCreated: b.is_artist_created ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
        venueName: b.venue_name ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    setRefreshing(false);
  }, [currentUser?.id]);

  // Check if any venue has overdue invoice reminder
  const hasOverdueInvoice = useMemo(() => {
    if (!currentUser) return false;
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const completedBookings = allBookings.filter(
      (b) => b.artistId === currentUser.id && b.isCompleted && b.status === 'completed'
    );
    const venueIds = [...new Set(completedBookings.map((b) => b.venueId))];
    return venueIds.some((vid) => {
      const reminder = getReminder(vid, currentUser.id);
      const sentThisMonth = allInvoices.some((inv) => {
        const d = new Date(inv.sentAt);
        return inv.venueId === vid && inv.artistId === currentUser.id && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      // Red badge only when PAST the reminder day (overdue), not on the day itself
      return !sentThisMonth && currentDay > reminder;
    });
  }, [allBookings, allInvoices, currentUser, getReminder]);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.artistId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const nowDT = nowLocalDateTimeStr();

  // Auto-complete confirmed bookings whose start time has passed.
  // The artist's store does NOT hold the manager's slots, so we fall back to the
  // snapshot fields saved on the booking itself (slotDate/slotStartTime, written at
  // creation). Without this fallback the slot lookup always failed on the artist side,
  // so a past confirmed gig never flipped to completed — it disappeared from the
  // dashboard COMPLETED count, the Completed Gigs screen, and profile History.
  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted && !b.isArtistCreated)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const date = slot?.date ?? b.slotDate;
        const startTime = slot?.startTime ?? b.slotStartTime;
        if (date && startTime && isPastStart(date, startTime)) {
          const venue = allVenues.find((v) => v.id === b.venueId);
          updateBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: date,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: startTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
        }
      });
  }, [bookings, slots, nowDT, updateBookingStatus, allVenues]);

  const upcomingBookings = useMemo(() => {
    const regular = bookings
      .filter((b) => (b.status === 'confirmed' || b.status === 'requested') && !b.isArtistCreated)
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        // Fall back to snapshot when slot not in store
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId, venueId: b.venueId, date: b.slotDate,
          name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
        } : undefined);
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
        return { ...b, slot: resolvedSlot, venue: resolvedVenue };
      })
      .filter((b) => b.slot && isUpcoming(b.slot.date, b.slot.startTime));
    const privateConfirmed = bookings
      .filter((b) => b.isArtistCreated && b.status === 'confirmed' && !b.isCompleted && isUpcoming(b.slotDate ?? '', b.slotStartTime))
      .map((b) => ({ ...b, slot: undefined as typeof slots[number] | undefined, venue: undefined as typeof allVenues[number] | undefined }));
    return [...regular, ...privateConfirmed]
      .sort((a, b) => {
        const dateA = a.slot?.date ?? a.slotDate ?? '';
        const dateB = b.slot?.date ?? b.slotDate ?? '';
        return dateA < dateB ? -1 : 1;
      })
      .slice(0, 6);
  }, [bookings, slots, allVenues, nowDT]);

  const pendingCount = useMemo(() => bookings.filter((b) => b.status === 'requested' || b.status === 'past_confirmation').length, [bookings]);
  const confirmedCount = useMemo(() => bookings.filter((b) => b.status === 'confirmed' && !b.isCompleted).length, [bookings]);
  const venueCount = useMemo(() => {
    // Count from venueAssignments (new system) + legacy lineups, deduplicated by venueId
    const assignedVenueIds = new Set<string>();
    allVenueAssignments
      .filter((a) => a.artistId === currentUser?.id && a.status === 'active')
      .forEach((a) => assignedVenueIds.add(a.venueId));
    allLineups
      .filter((r) => r.artistId === currentUser?.id && r.status === 'active')
      .forEach((r) => assignedVenueIds.add(r.venueId));
    return assignedVenueIds.size;
  }, [allVenueAssignments, allLineups, currentUser?.id]);

  // Completed gigs — with slot/venue snapshot fallback
  const completedBookings = useMemo(() => bookings
    .filter((b) => b.status === 'completed' || b.isCompleted)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      const venue = allVenues.find((v) => v.id === b.venueId);
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
      return { ...b, slot: resolvedSlot, venue: resolvedVenue };
    })
    .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1),
    [bookings, slots, allVenues]
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Wordmark size={26} />
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={[styles.notifBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/(artist)/notifications' as Href)}
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
          <SummaryCard label="CONFIRMED" value={confirmedCount} color={colors.success} colors={colors} onPress={() => router.push('/(artist)/confirmed-gigs' as Href)} />
          <SummaryCard label="PENDING" value={pendingCount} color={colors.warning} colors={colors} onPress={() => router.push('/(artist)/pending-requests' as Href)} />
          <SummaryCard label="COMPLETED" value={completedBookings.length} color="#2563EB" colors={colors} onPress={() => router.push('/(artist)/completed-gigs' as Href)} />
        </View>

        {/* Upcoming Gigs */}
        <View style={styles.section}>
          <SectionHeader
            title="Upcoming"
            actionLabel="See all"
            onAction={() => router.push('/(artist)/confirmed-gigs' as Href)}
          />
          {upcomingBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No upcoming gigs</Text>
            </View>
          ) : (
            upcomingBookings.map((booking) => {
              const venuePhoto = booking.venue ? venuePhotoUri(booking.venue) : undefined;
              return (
              <Pressable
                key={booking.id}
                style={({ pressed }) => [styles.gigCard, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
              >
                {venuePhoto ? (
                  <Image source={{ uri: venuePhoto }} style={styles.gigPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.gigPhoto, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialIcons name={booking.isArtistCreated ? 'event' : 'place'} size={20} color={colors.muted} />
                  </View>
                )}
                <View style={styles.gigInfo}>
                  <Text style={[styles.gigVenue, { color: colors.foreground }]} numberOfLines={1}>
                    {booking.isArtistCreated ? (booking.slotName ?? 'Private Event') : (booking.venue?.name ?? 'Unknown Venue')}
                  </Text>
                  <Text style={[styles.gigSlot, { color: colors.muted }]} numberOfLines={1}>
                    {booking.isArtistCreated && booking.slotDate
                      ? `${formatDate(booking.slotDate)}${booking.slotStartTime ? ` · ${formatTime(booking.slotStartTime)}–${formatTime(booking.slotEndTime ?? '')}` : ''}`
                      : booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
                  </Text>
                </View>
              </Pressable>
              );
            })
          )}
        </View>

      </ScrollView>
      {/* Invoice FAB */}
      <Pressable
        style={({ pressed }) => [styles.invoiceFab, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => router.push('/(artist)/invoices' as Href)}
      >
        <MaterialIcons name="receipt-long" size={24} color="#fff" />
        {hasOverdueInvoice && (
          <View style={styles.fabBadge} />
        )}
      </Pressable>
    </ScreenContainer>
  );
}

function SummaryCard({ label, value, color, colors, onPress }: {
  label: string; value: number; color: string;
  colors: ReturnType<typeof import('@/hooks/use-colors').useColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed && onPress ? 0.75 : 1 }]}
      onPress={onPress}
    >
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.muted }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerLogo: { width: 24, height: 44 },
  greeting: { fontSize: 13, marginBottom: 2 },
  name: { fontSize: 22, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 24 },
  pendingBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  pendingBannerAction: { fontSize: 13, fontWeight: '700' },
  section: { marginBottom: 28 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  gigCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 2, gap: 12 },
  gigPhoto: { width: 48, height: 48, borderRadius: 24 },
  gigInfo: { flex: 1 },
  gigVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  gigSlot: { fontSize: 13 },
  // Completed Gigs section — mirrors manager dashboard styles
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
  bookingSubInfo: { flex: 1 },
  bookingSubName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  bookingSubDetail: { fontSize: 12 },
  venueChipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  venueChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  venueChipText: { fontSize: 13, fontWeight: '600' },
  invoiceFab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#E2674A', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  fabBadge: { position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#E2674A' },
});
