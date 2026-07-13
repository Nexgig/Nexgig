import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Image, RefreshControl, Modal } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { Wordmark } from '@/components/wordmark';
import { Divider, StatRow } from '@/components/ui/card-free';
import { fonts } from '@/lib/fonts';
import { MaterialIcons } from '@expo/vector-icons';
import { SectionHeader } from '@/components/ui/section-header';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, useNotificationStore, useInvoiceStore, useBookingFilterStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastStart, isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function ManagerDashboard() {
  const router = useRouter();
  const colors = useColors();
  const { formatTime: fmtTime } = useFormatTime();
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

  // Booking ids that appear in a non-cancelled invoice → "Invoiced" chip.
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const invoicedBookingIds = useMemo(() => new Set(
    allInvoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
  ), [allInvoices, currentUser?.id]);

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

  // Combined list for the "Bookings" section: pending + confirmed + completed,
  // ALL dates. Resolves slot/venue/dj with snapshot fallback, tags each with a
  // display status + dot color, and sorts active (pending/confirmed) first by
  // soonest date, then completed by most-recent.
  const dashboardBookings = useMemo(() => bookings
    .filter((b) =>
      b.status === 'requested' || b.status === 'past_confirmation' ||
      b.status === 'confirmed' || b.status === 'completed' || b.isCompleted)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
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
      const isDone = b.status === 'completed' || b.isCompleted;
      const isPending = b.status === 'requested' || b.status === 'past_confirmation';
      const statusKey = isDone ? 'completed' : isPending ? 'pending' : 'confirmed';
      const dotColor = isDone ? '#2563EB' : isPending ? '#F59E0B' : '#22C55E';
      const isInvoiced = invoicedBookingIds.has(b.id);
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue, statusKey, dotColor, isDone, isInvoiced };
    })
    .sort((a, b) => {
      // Active (pending/confirmed) above completed.
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? '';
      const db = b.slot?.date ?? '';
      // Active: soonest first (ascending). Completed: most-recent first (descending).
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    }),
    [bookings, slots, artistUsers, allVenues, invoicedBookingIds]
  );

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

  // Group bookings by slot so a slot with several artists shows as ONE row
  // (stacked avatars + joined names). Status dot uses the highest-priority
  // status among the slot's artists: pending > confirmed > completed.
  const groupedBookingsPreview = useMemo(() => {
    const groups = new Map<string, typeof filteredDashboardBookings>();
    const order: string[] = [];
    for (const b of filteredDashboardBookings) {
      const key = b.slotId ?? b.id;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(b);
    }
    const rank: Record<string, number> = { pending: 0, confirmed: 1, completed: 2 };
    const dotFor: Record<string, string> = { pending: '#F59E0B', confirmed: '#22C55E', completed: '#2563EB' };
    return order.slice(0, 6).map((key) => {
      const items = groups.get(key)!;
      const first = items[0];
      const statusKey = items.reduce((acc, it) => (rank[it.statusKey] < rank[acc] ? it.statusKey : acc), first.statusKey);
      return {
        key,
        first,
        djs: items.map((it) => it.dj),
        dotColor: dotFor[statusKey],
        isInvoiced: items.some((it) => it.isInvoiced),
        count: items.length,
      };
    });
  }, [filteredDashboardBookings]);

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
        venueName: b.venue_name ?? undefined, venuePhotoUrl: b.venue_photo_url ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
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
            <Wordmark size={26} />
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

        {/* Summary — inline stat row, no boxes */}
        <Divider full />
        <StatRow
          items={[
            {
              value: upcomingBookings.filter((b) => b.status === 'confirmed').length,
              label: 'Confirmed',
              color: colors.success,
              onPress: () => router.push('/(manager)/confirmed-bookings' as Href),
            },
            {
              value: pendingCount,
              label: 'Pending',
              color: colors.warning,
              onPress: () => router.push('/(manager)/pending-requests' as Href),
            },
            {
              value: completedCount,
              label: 'Completed',
              color: '#2563EB',
              onPress: () => router.push('/(manager)/completed-gigs' as Href),
            },
          ]}
        />
        <Divider full />

        {/* Bookings */}
        <View style={styles.section}>
          <SectionHeader
            title="Bookings"
            actionLabel="See all"
            onAction={() => router.push('/(manager)/all-bookings' as Href)}
            leftAccessory={
              <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="tune" size={18} color={colors.muted} />
              </Pressable>
            }
          />
          {groupedBookingsPreview.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
            </View>
          ) : (
            groupedBookingsPreview.map((g) => {
              const names = g.djs.map((d) => d?.fullName ?? 'Unknown Artist');
              const title = g.count === 1
                ? names[0]
                : `${names.slice(0, 2).join(', ')}${g.count > 2 ? ` +${g.count - 2}` : ''}`;
              return (
              <Pressable
                key={g.key}
                style={({ pressed }) => [styles.bookingCard, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/booking-detail?id=' + g.first.id) as Href)}
              >
                {g.count === 1 ? (
                  <AvatarImage uri={g.djs[0]?.profilePhotoUrl} avatarId={(g.djs[0] as any)?.avatarId} seed={(g.djs[0] as any)?.id} size={48} variant="artist" />
                ) : (
                  <View style={styles.avatarStack}>
                    {g.djs.slice(0, 3).map((d, i) => (
                      <View key={i} style={[styles.stackedAvatar, { marginLeft: i === 0 ? 0 : -16, zIndex: 3 - i, borderColor: colors.background }]}>
                        <AvatarImage uri={d?.profilePhotoUrl} avatarId={(d as any)?.avatarId} seed={(d as any)?.id} name={d?.fullName} size={44} variant="artist" />
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.gigInfo}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.bookingDJ, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                      {title}
                      {g.first.venue?.name ? <Text style={{ color: colors.muted, fontWeight: '500' }}> / {g.first.venue.name}</Text> : null}
                    </Text>
                    {g.isInvoiced && (
                      <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                        <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.bookingSub, { color: colors.muted }]} numberOfLines={1}>
                    {g.first.slot ? `${formatDate(g.first.slot.date)} · ${fmtTime(g.first.slot.startTime)}–${fmtTime(g.first.slot.endTime)}` : ''}
                  </Text>
                </View>
                {/* Status mark — 12px rounded square (green/amber/blue) */}
                <View style={[styles.statusMark, { backgroundColor: g.dotColor }]} />
              </Pressable>
              );
            })
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
              <View style={styles.emptyCard}>
                <MaterialIcons name="check-circle" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No completed bookings yet</Text>
              </View>
            ) : (
              <View style={styles.monthTable}>
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
                        <View style={[styles.monthBadge, { backgroundColor: colors.muted + '15', borderColor: colors.muted + '30', marginRight: 8 }]}>
                          <Text style={[styles.monthBadgeText, { color: colors.muted }]}>{monthBookings.length}</Text>
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
      <Text style={[styles.summaryLabel, { color: colors.muted }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </Pressable>
  );
}



const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerLeft: {},
  headerLogo: { width: 24, height: 44 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 13, marginBottom: 2 },
  name: { fontSize: 22, fontWeight: '800' },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  summaryCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800', fontFamily: fonts.bodyBold },
  summaryLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { marginTop: 24, marginBottom: 28 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  bookingCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 2, gap: 12 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackedAvatar: { borderRadius: 999, borderWidth: 2 },
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
  bookingDJ: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  bookingVenue: { fontSize: 13, marginBottom: 2 },
  bookingTime: { fontSize: 12 },
  bookingSub: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  statusMark: { width: 11, height: 11, borderRadius: 5.5, marginLeft: 6 },
  venueBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 36, marginLeft: 12 },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 18, fontFamily: fonts.display },
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
  bookingSubAvatarText: { fontSize: 14, fontWeight: '700' },
  bookingSubInfo: { flex: 1 },
  bookingSubName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  bookingSubDetail: { fontSize: 12 },
  venueChipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  venueChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, borderColor: 'transparent' },
  venueChipText: { fontSize: 13, fontWeight: '600' },
});
