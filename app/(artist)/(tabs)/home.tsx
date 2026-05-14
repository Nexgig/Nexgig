import { useMemo, useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore, useNotificationStore, useInvoiceStore, useInvoiceReminderStore } from '@/lib/store';
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

  // Auto-complete confirmed bookings whose slot start time has passed
  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        if (slot && isPastStart(slot.date, slot.startTime)) {
          const venue = allVenues.find((v) => v.id === b.venueId);
          updateBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: slot.date,
            slotName: slot.name,
            slotStartTime: slot.startTime,
            slotEndTime: slot.endTime,
            venueName: venue?.name,
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
        return { ...b, slot, venue };
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
      .slice(0, 4);
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

  // Group by month
  const completedByMonth = useMemo(() => {
    const map: Record<string, typeof completedBookings> = {};
    completedBookings.forEach((b) => {
      const dateStr = b.slot?.date;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return Object.entries(map).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [completedBookings]);

  // Venue filter list
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

  const [completedOpen, setCompletedOpen] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const toggleMonth = useCallback((month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }, []);

  const filteredCompletedBookings = useMemo(() => {
    if (!selectedVenueId) return completedBookings;
    return completedBookings.filter((b) => (b.venue?.id ?? b.venueId) === selectedVenueId);
  }, [completedBookings, selectedVenueId]);

  const filteredByMonth = useMemo(() => {
    const map: Record<string, typeof filteredCompletedBookings> = {};
    filteredCompletedBookings.forEach((b) => {
      const dateStr = b.slot?.date;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return Object.entries(map).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [filteredCompletedBookings]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.muted }]}>{greeting}</Text>
            <Text style={[styles.name, { color: colors.foreground }]}>{currentUser?.fullName?.split(' ')[0] ?? 'Artist'}</Text>
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
          <SummaryCard label="VENUES" value={venueCount} color={colors.primary} colors={colors} onPress={() => router.push('/(artist)/my-venues' as Href)} />
        </View>

        {/* Upcoming Gigs */}
        <View style={styles.section}>
          <SectionHeader
            title="Upcoming"
            actionLabel="See all"
            onAction={() => router.push('/(artist)/(tabs)/bookings' as Href)}
          />
          {upcomingBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No upcoming gigs</Text>
            </View>
          ) : (
            upcomingBookings.map((booking) => (
              <Pressable
                key={booking.id}
                style={({ pressed }) => [styles.gigCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
              >
                <View style={[styles.gigColorBar, { backgroundColor: booking.status === 'confirmed' ? colors.success : colors.warning }]} />
                <View style={styles.gigInfo}>
                  <Text style={[styles.gigVenue, { color: colors.foreground }]} numberOfLines={1}>
                    {booking.isArtistCreated ? (booking.slotName ?? 'Private Event') : (booking.venue?.name ?? 'Unknown Venue')}
                  </Text>
                  <Text style={[styles.gigSlot, { color: colors.muted }]}>
                    {booking.isArtistCreated && booking.slotDate
                      ? `${formatDate(booking.slotDate)}${booking.slotStartTime ? ` · ${formatTime(booking.slotStartTime)}–${formatTime(booking.slotEndTime ?? '')}` : ''}`
                      : booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
                  </Text>
                </View>
                <StatusBadge status={booking.status} />
              </Pressable>
            ))
          )}
        </View>

        {/* Completed Gigs */}
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
                    style={[styles.venueChip, { borderColor: colors.border }, !selectedVenueId && { backgroundColor: colors.foreground }]}
                    onPress={() => setSelectedVenueId(null)}
                  >
                    <Text style={[styles.venueChipText, { color: !selectedVenueId ? colors.background : colors.foreground }]}>All</Text>
                  </Pressable>
                  {completedVenueList.map((v) => (
                    <Pressable
                      key={v.id}
                      style={[styles.venueChip, { borderColor: colors.border }, selectedVenueId === v.id && { backgroundColor: colors.foreground }]}
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
                  <Text style={[styles.emptyText, { color: colors.muted }]}>No completed gigs yet</Text>
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
                        {isExpanded && monthBookings.map((booking) => (
                          <Pressable
                            key={booking.id}
                            style={({ pressed }) => [styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                            onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
                          >
                            <View style={styles.bookingSubLeft}>
                              <View style={[styles.bookingSubAvatar, { backgroundColor: colors.primary + '20' }]}>
                                <MaterialIcons name="music-note" size={16} color={colors.primary} />
                              </View>
                              <View style={styles.bookingSubInfo}>
                                <Text style={[styles.bookingSubName, { color: colors.foreground }]} numberOfLines={1}>
                                  {booking.venue?.name ?? booking.venueName ?? 'Unknown Venue'}
                                </Text>
                                <Text style={[styles.bookingSubDetail, { color: colors.muted }]} numberOfLines={1}>
                                  {booking.slot?.date ? formatDate(booking.slot.date) : ''}
                                  {booking.slot?.startTime ? ` · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime ?? '')}` : ''}
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
      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
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
  gigCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  gigColorBar: { width: 4, height: 44, borderRadius: 2 },
  gigInfo: { flex: 1 },
  gigVenue: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
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
  invoiceFab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  fabBadge: { position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#2563EB' },
});
