import { useMemo, useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Modal } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { Divider, StatRow } from '@/components/ui/card-free';
import { Wordmark } from '@/components/wordmark';
import { MaterialIcons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui/section-header';
import { fonts } from '@/lib/fonts';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore, useNotificationStore, useInvoiceStore } from '@/lib/store';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { supabase } from '@/lib/supabase';
import { fetchPrivateEventBookings } from '@/lib/private-events';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastEnd, isUpcoming, nowLocalDateTimeStr, monthKey, monthLabel } from '@/lib/utils';
import { MonthSeparator } from '@/components/ui/month-separator';

/**
 * Sentinel for the Bookings venue filter. Private events live in availability_blocks
 * and are reconstructed with an empty venueId, so they match no venue row — they need
 * their own option rather than a venue id. Not a real venue id; never persisted.
 */
const PRIVATE_GIGS_FILTER = '__private_gigs__';

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
    // clearBookings() wipes private events too — they live in availability_blocks, NOT
    // the bookings table, so this fetch can't bring them back. Rebuild them alongside.
    const [bookingsRes, privateBookings] = await Promise.all([
      supabase.from('bookings').select('*').eq('artist_id', currentUser.id),
      fetchPrivateEventBookings(currentUser.id),
    ]);
    const data = bookingsRes.data;
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
        venueName: b.venue_name ?? undefined, venueType: b.venue_type ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    privateBookings.forEach((bk) => addBooking(bk));
    setRefreshing(false);
  }, [currentUser?.id]);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.artistId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const nowDT = nowLocalDateTimeStr();

  // Auto-complete confirmed bookings whose END time has passed.
  // End, not start: a gig isn't done when it begins, and completion is what triggers
  // the review flow. isPastEnd handles the midnight cross (20:00–00:00 ends next day).
  //
  // The artist's store does NOT hold the manager's slots, so we fall back to the
  // snapshot fields saved on the booking itself (slotDate/slotStartTime/slotEndTime,
  // written at creation). Without this fallback the slot lookup always failed on the
  // artist side, so a past confirmed gig never flipped to completed — it disappeared
  // from the dashboard COMPLETED count, Completed Gigs, and profile History.
  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted && !b.isArtistCreated)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const date = slot?.date ?? b.slotDate;
        const startTime = slot?.startTime ?? b.slotStartTime;
        const endTime = slot?.endTime ?? b.slotEndTime;
        if (date && startTime && isPastEnd(date, startTime, endTime)) {
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
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
        const isDone = b.status === 'completed' || b.isCompleted;
        const isPending = b.status === 'requested' || b.status === 'past_confirmation';
        const statusKey = isDone ? 'completed' : isPending ? 'pending' : 'confirmed';
        const dotColor = isDone ? STATUS_COLORS.completed : isPending ? STATUS_COLORS.pending : STATUS_COLORS.confirmed;
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

  // Venue filter for the Bookings section, mirroring the manager dashboard.
  const [bookingVenueId, setBookingVenueId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Distinct venues present in the artist's (non-private) bookings, for the filter popup.
  const bookingVenues = useMemo(() => {
    const seen = new Map<string, string>();
    dashboardBookings.forEach((b) => {
      if (b.venueId && !b.isArtistCreated) seen.set(b.venueId, b.venue?.name ?? b.venueName ?? 'Unknown Venue');
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [dashboardBookings]);

  // Hide completed bookings from the dashboard list; apply the venue filter.
  const dashboardBookingsPreviewFiltered = useMemo(() => {
    const active = dashboardBookings.filter((b) => !b.isDone);
    const scoped =
      bookingVenueId === PRIVATE_GIGS_FILTER ? active.filter((b) => b.isArtistCreated)
      : bookingVenueId ? active.filter((b) => b.venueId === bookingVenueId)
      : active;
    return scoped.slice(0, 6);
  }, [dashboardBookings, bookingVenueId]);

  // Private events carry no venueId, so they can never match a venue row — without
  // their own option they're reachable only via "All venues".
  const hasPrivateGigs = useMemo(
    () => dashboardBookings.some((b) => b.isArtistCreated),
    [dashboardBookings]
  );

  // Month headers for the Bookings window. The DateBadge shows weekday + day but no
  // month, so a list crossing months is ambiguous without them — and a lone "June"
  // header on an all-June list is just noise. Computed on the VISIBLE rows (after the
  // venue filter AND the slice(0, 6)), not the raw data: a July gig below the cut must
  // not put a "June" header on a list the user sees as all-June.
  const bookingsSpanMonths = useMemo(() => {
    const months = new Set(
      dashboardBookingsPreviewFiltered
        .map((b) => b.slot?.date ?? b.slotDate)
        .filter(Boolean)
        .map((d) => monthKey(d as string))
    );
    return months.size > 1;
  }, [dashboardBookingsPreviewFiltered]);

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
              style={styles.notifBtn}
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

        {/* Summary — inline stat row, no boxes.
            STATUS_COLORS, not theme tokens: these tiles label the same statuses as the
            badges below them, so they must move together. */}
        <StatRow
          items={[
            { value: confirmedCount, label: 'Confirmed', color: STATUS_COLORS.confirmed, onPress: () => router.push('/(artist)/confirmed-gigs' as Href) },
            { value: pendingCount, label: 'Pending', color: STATUS_COLORS.pending, onPress: () => router.push('/(artist)/pending-requests' as Href) },
            { value: completedBookings.length, label: 'Completed', color: STATUS_COLORS.completed, onPress: () => router.push('/(artist)/completed-gigs' as Href) },
          ]}
        />
        <Divider full />

        {/* Bookings */}
        <View style={styles.section}>
          <SectionHeader
            title="Bookings"
            rightAccessory={
              <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="tune" size={20} color={bookingVenueId ? colors.primary : colors.muted} />
              </Pressable>
            }
          />
          {dashboardBookingsPreviewFiltered.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
            </View>
          ) : (
            dashboardBookingsPreviewFiltered.map((booking, idx) => {
              const bDate = booking.slot?.date ?? booking.slotDate;
              const prev = idx > 0 ? dashboardBookingsPreviewFiltered[idx - 1] : undefined;
              const prevDate = prev ? (prev.slot?.date ?? prev.slotDate) : undefined;
              const showMonth = bookingsSpanMonths && !!bDate &&
                (!prevDate || monthKey(bDate) !== monthKey(prevDate));
              return (
              <View key={booking.id}>
              {showMonth && (
                <MonthSeparator label={monthLabel(bDate!)} color={colors.muted} borderColor={colors.border} center />
              )}
              <Pressable
                style={({ pressed }) => [styles.gigCard, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
              >
                <DateBadge dateStr={bDate} color={booking.dotColor} />
                <View style={styles.gigInfo}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.gigVenue, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                      {booking.isArtistCreated ? (booking.slotName ?? 'Private Event') : (booking.venue?.name ?? 'Unknown Venue')}
                    </Text>
                  </View>
                  <Text style={[styles.gigSlot, { color: colors.muted }]} numberOfLines={1}>
                    {booking.slotStartTime || booking.slot?.startTime
                      ? `${fmtTime(booking.slot?.startTime ?? booking.slotStartTime ?? '')}–${fmtTime(booking.slot?.endTime ?? booking.slotEndTime ?? '')}`
                      : ''}
                  </Text>
                </View>
                {booking.isInvoiced && (
                  <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                    <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                  </View>
                )}
              </Pressable>
              </View>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* Bookings venue filter popup */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setFilterOpen(false)}>
          <Pressable style={[styles.filterSheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.filterTitle, { color: colors.foreground }]}>Filter by venue</Text>
            {[
              { id: null as string | null, name: 'All venues' },
              ...bookingVenues,
              ...(hasPrivateGigs ? [{ id: PRIVATE_GIGS_FILTER as string | null, name: 'Private gigs' }] : []),
            ].map((v) => {
              const active = bookingVenueId === v.id;
              return (
                <Pressable
                  key={v.id ?? 'all'}
                  style={({ pressed }) => [styles.filterRow, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => { setBookingVenueId(v.id); setFilterOpen(false); }}
                >
                  <Text style={[styles.filterRowLabel, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{v.name}</Text>
                  {active && <MaterialIcons name="check" size={18} color={colors.primary} />}
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
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E2674A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
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
  invoicedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0, marginLeft: 6 },
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
