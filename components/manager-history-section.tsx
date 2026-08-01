import { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useBookingStore, useSlotStore, useLineupStore, useVenueStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { formatDate } from '@/lib/conflict-detection';
import { bookingVenueName } from '@/lib/utils';
import { fonts } from '@/lib/fonts';

// The manager's completed-gig HISTORY — collapsible, venue-filterable, month-grouped.
// Lives on the manager PROFILE (under Invoices). Self-contained: reads the stores itself and
// returns null when nothing is completed, so it never shows an empty section. Moved here from
// the dashboard so the dashboard stays focused on live bookings.
export function ManagerHistorySection() {
  const colors = useColors();
  const router = useRouter();
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);
  const allVenues = useVenueStore((s) => s.venues);

  const [open, setOpen] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const toggleMonth = useCallback((month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }, []);

  const completedBookings = useMemo(() => allBookings
    .filter((b) => b.status === 'completed' || b.isCompleted)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      // Null artist_id means the artist deleted their account → show "Former Artist".
      const dj = b.artistId == null
        ? { fullName: 'Former Artist', profilePhotoUrl: undefined }
        : artistUsers.find((u) => u.id === b.artistId);
      const venue = allVenues.find((v) => v.id === b.venueId);
      // Live slot/venue if available, else fall back to the snapshot stored on the booking.
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId, venueId: b.venueId, date: b.slotDate, name: b.slotName ?? '',
        startTime: b.slotStartTime ?? '', endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
      } : undefined);
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue };
    })
    .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1),
    [allBookings, slots, artistUsers, allVenues]
  );

  // Venues that appear in completed bookings (for filter chips).
  const completedVenueList = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    completedBookings.forEach((b) => {
      const venueId = b.venue?.id ?? b.venueId;
      const venueName = b.venue?.name ?? b.venueName;
      if (venueId && venueName && !seen.has(venueId)) { seen.add(venueId); list.push({ id: venueId, name: venueName }); }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [completedBookings]);

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

  if (completedBookings.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <Pressable
          style={[styles.collapseHeader, { borderColor: colors.border }]}
          onPress={() => setOpen((v) => !v)}
        >
          <View style={styles.collapseHeaderLeft}>
            <Text style={[styles.collapseTitle, { color: colors.foreground }]}>History</Text>
          </View>
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
        </Pressable>
        {open && (
          <>
            {completedVenueList.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueChipRow} style={{ marginBottom: 12 }}>
                <Pressable style={[styles.venueChip, !selectedVenueId && { backgroundColor: colors.foreground }]} onPress={() => setSelectedVenueId(null)}>
                  <Text style={[styles.venueChipText, { color: !selectedVenueId ? colors.background : colors.foreground }]}>All</Text>
                </Pressable>
                {completedVenueList.map((v) => (
                  <Pressable key={v.id} style={[styles.venueChip, selectedVenueId === v.id && { backgroundColor: colors.foreground }]} onPress={() => setSelectedVenueId(v.id)}>
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
                        style={({ pressed }) => [styles.monthRow, { borderTopColor: colors.border, opacity: pressed ? 0.75 : 1 }, idx === 0 && { borderTopWidth: 0 }]}
                        onPress={() => toggleMonth(month)}
                      >
                        <MaterialIcons name="calendar-today" size={14} color={colors.muted} style={{ marginRight: 8 }} />
                        <Text style={[styles.monthLabel, { color: colors.foreground }]}>{month}</Text>
                        <View style={[styles.monthBadge, { backgroundColor: colors.muted + '15', borderColor: colors.muted + '30', marginRight: 8 }]}>
                          <Text style={[styles.monthBadgeText, { color: colors.muted }]}>{monthBookings.length}</Text>
                        </View>
                        <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={18} color={colors.muted} />
                      </Pressable>
                      {isExpanded && monthBookings.map((booking) => (
                        <Pressable
                          key={booking.id}
                          style={({ pressed }) => [styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                          onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
                        >
                          <View style={styles.bookingSubLeft}>
                            <View style={[styles.bookingSubAvatar, { backgroundColor: colors.primary + '20' }]}>
                              <Text style={[styles.bookingSubAvatarText, { color: colors.primary }]}>{(booking.dj?.fullName ?? '?')[0].toUpperCase()}</Text>
                            </View>
                            <View style={styles.bookingSubInfo}>
                              <Text style={[styles.bookingSubName, { color: colors.foreground }]} numberOfLines={1}>{booking.dj?.fullName ?? 'Unknown Artist'}</Text>
                              <Text style={[styles.bookingSubDetail, { color: colors.muted }]} numberOfLines={1}>
                                {bookingVenueName(booking, booking.venue?.name)}{booking.slot?.date ? ` · ${formatDate(booking.slot.date)}` : ''}
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
      <Divider />
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 18, fontFamily: fonts.display },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
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
  venueChipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  venueChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, borderColor: 'transparent' },
  venueChipText: { fontSize: 13, fontWeight: '600' },
});
