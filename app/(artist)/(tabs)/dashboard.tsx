import { useMemo, useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Image, RefreshControl, Modal } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { Divider, StatRow } from '@/components/ui/card-free';
import { Wordmark } from '@/components/wordmark';
import { MaterialIcons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui/section-header';
import { fonts } from '@/lib/fonts';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore, useNotificationStore, useInvoiceStore, useBookingFilterStore, venuePhotoUri } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastStart, isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function DJHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allLineups = useLineupStore((s) => s.lineups);
  const allVenueAssignments = useLineupStore((s) => s.venueAssignments);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const allInvoices = useInvoiceStore((s) => s.invoices);

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
        venueName: b.venue_name ?? undefined, venuePhotoUrl: b.venue_photo_url ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    setRefreshing(false);
  }, [currentUser?.id]);

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
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName, photoUrls: b.venuePhotoUrl ? [b.venuePhotoUrl] : [] } as any : undefined);
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

  // Combined "Bookings" list: confirmed + pending + completed, ALL dates.
  // Mirrors the manager dashboard. Resolves slot/venue with snapshot fallback,
  // handles artist-created private events, tags each with a status + dot color,
  // and sorts active (pending/confirmed) first by soonest, completed most-recent.
  const dashboardBookings = useMemo(() => {
    const invoicedIds = new Set(
      allInvoices
        .filter((inv) => inv.artistId === currentUser?.id && inv.status !== 'cancelled')
        .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
    );
    const mapped = bookings
      .filter((b) =>
        b.status === 'requested' || b.status === 'past_confirmation' ||
        b.status === 'confirmed' || b.status === 'completed' || b.isCompleted)
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId, venueId: b.venueId, date: b.slotDate,
          name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
        } : undefined);
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName, photoUrls: b.venuePhotoUrl ? [b.venuePhotoUrl] : [] } as any : undefined);
        const isDone = b.status === 'completed' || b.isCompleted;
        const isPending = b.status === 'requested' || b.status === 'past_confirmation';
        const statusKey = isDone ? 'completed' : isPending ? 'pending' : 'confirmed';
        const dotColor = isDone ? '#2563EB' : isPending ? '#F59E0B' : '#22C55E';
        return { ...b, slot: resolvedSlot, venue: resolvedVenue, statusKey, dotColor, isDone, isInvoiced: invoicedIds.has(b.id) };
      });
    return mapped.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? a.slotDate ?? '';
      const db = b.slot?.date ?? b.slotDate ?? '';
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    });
  }, [bookings, slots, allVenues, allInvoices, currentUser?.id]);

  const dashboardBookingsPreview = useMemo(() => dashboardBookings.slice(0, 6), [dashboardBookings]);

  // Status filter for the Bookings section (persisted per user, default all on).
  const bookingFilter = useBookingFilterStore((s) => s.getFilter(currentUser?.id ?? ''));
  const setBookingFilter = useBookingFilterStore((s) => s.setFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const filteredDashboardBookings = useMemo(
    () => dashboardBookings.filter((b) => bookingFilter[b.statusKey as 'pending' | 'confirmed' | 'completed']),
    [dashboardBookings, bookingFilter]
  );
  const dashboardBookingsPreviewFiltered = useMemo(() => filteredDashboardBookings.slice(0, 6), [filteredDashboardBookings]);

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
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName, photoUrls: b.venuePhotoUrl ? [b.venuePhotoUrl] : [] } as unknown as typeof venue : undefined);
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

        {/* Summary — inline stat row, no boxes */}
        <StatRow
          items={[
            { value: confirmedCount, label: 'Confirmed', color: colors.success, onPress: () => router.push('/(artist)/confirmed-gigs' as Href) },
            { value: pendingCount, label: 'Pending', color: colors.warning, onPress: () => router.push('/(artist)/pending-requests' as Href) },
            { value: completedBookings.length, label: 'Completed', color: '#2563EB', onPress: () => router.push('/(artist)/completed-gigs' as Href) },
          ]}
        />
        <Divider full />

        {/* Bookings */}
        <View style={styles.section}>
          <SectionHeader
            title="Bookings"
            actionLabel="See all"
            onAction={() => router.push('/(artist)/all-bookings' as Href)}
            leftAccessory={
              <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="tune" size={18} color={colors.muted} />
              </Pressable>
            }
          />
          {dashboardBookingsPreviewFiltered.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
            </View>
          ) : (
            dashboardBookingsPreviewFiltered.map((booking) => {
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
                  <View style={styles.titleRow}>
                    <Text style={[styles.gigVenue, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                      {booking.isArtistCreated ? (booking.slotName ?? 'Private Event') : (booking.venue?.name ?? 'Unknown Venue')}
                    </Text>
                    {booking.isInvoiced && (
                      <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                        <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.gigSlot, { color: colors.muted }]} numberOfLines={1}>
                    {booking.isArtistCreated && booking.slotDate
                      ? `${formatDate(booking.slotDate)}${booking.slotStartTime ? ` · ${fmtTime(booking.slotStartTime)}–${fmtTime(booking.slotEndTime ?? '')}` : ''}`
                      : booking.slot ? `${formatDate(booking.slot.date)} · ${fmtTime(booking.slot.startTime)}–${fmtTime(booking.slot.endTime)}` : ''}
                  </Text>
                </View>
                {/* Status dot — Clash Display period, like the manager dashboard */}
                <View style={[styles.statusMark, { backgroundColor: booking.dotColor }]} />
              </Pressable>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* Bookings status filter popup */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setFilterOpen(false)}>
          <Pressable style={[styles.filterSheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.filterTitle, { color: colors.foreground }]}>Show in Bookings</Text>
            {([
              { key: 'pending' as const, label: 'Pending', dot: '#F59E0B' },
              { key: 'confirmed' as const, label: 'Confirmed', dot: '#22C55E' },
              { key: 'completed' as const, label: 'Completed', dot: '#2563EB' },
            ]).map((opt) => {
              const checked = bookingFilter[opt.key];
              return (
                <Pressable
                  key={opt.key}
                  style={({ pressed }) => [styles.filterRow, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => currentUser && setBookingFilter(currentUser.id, opt.key, !checked)}
                >
                  <View style={[styles.filterRowMark, { backgroundColor: opt.dot }]} />
                  <Text style={[styles.filterRowLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <View style={[styles.filterCheck, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                    {checked && <MaterialIcons name="check" size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
  summaryValue: { fontSize: 28, fontWeight: '800', fontFamily: fonts.bodyBold },
  summaryLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 24 },
  pendingBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  pendingBannerAction: { fontSize: 13, fontWeight: '700' },
  section: { marginTop: 24 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  gigCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 2, gap: 12 },
  gigPhoto: { width: 48, height: 48, borderRadius: 24 },
  gigInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  invoicedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  invoicedChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  filterSheet: { width: '100%', maxWidth: 320, borderRadius: 16, borderWidth: 1, padding: 18, gap: 4 },
  filterTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 4 },
  filterRowDot: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 30, width: 18, transform: [{ translateY: -8 }] },
  filterRowMark: { width: 11, height: 11, borderRadius: 5.5, marginRight: 6 },
  filterRowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  filterCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  gigVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  gigSlot: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  statusMark: { width: 11, height: 11, borderRadius: 5.5, marginLeft: 6 },
  // Completed Gigs section — mirrors manager dashboard styles
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 16, fontWeight: '700' },
  collapseBadge: { marginLeft: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collapseBadgeText: { fontSize: 12, fontWeight: '600' },
  monthTable: {},
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
});
