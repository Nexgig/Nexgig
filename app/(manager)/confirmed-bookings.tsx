import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from '@/lib/rn';
import { VenueFilterRow } from '@/components/venue-filter-row';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function ConfirmedBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);

  const nowDT = nowLocalDateTimeStr();

  const confirmedBookings = useMemo(() => {
    return allBookings
      .filter((b) => b.managerId === currentUser?.id && b.status === 'confirmed')
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const dj = artistUsers.find((u) => u.id === b.artistId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        return { ...b, slot, dj, venue };
      })
      .filter((b) => b.slot && isUpcoming(b.slot.date, b.slot.startTime))
      .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1);
  }, [allBookings, currentUser?.id, slots, artistUsers, allVenues, nowDT]);

  // Venue filter — chips derived from the venues actually present in this list.
  const [venueFilter, setVenueFilter] = useState<string | null>(null);
  const venueChips = useMemo(() => {
    const m = new Map<string, string>();
    confirmedBookings.forEach((b) => { if (b.venueId) m.set(b.venueId, b.venue?.name ?? b.venueName ?? 'Venue'); });
    return [...m].map(([id, name]) => ({ id, name }));
  }, [confirmedBookings]);
  const shownBookings = useMemo(
    () => venueFilter ? confirmedBookings.filter((b) => b.venueId === venueFilter) : confirmedBookings,
    [confirmedBookings, venueFilter]
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Confirmed Bookings</Text>
        <View style={styles.backBtn} />
      </View>

      <VenueFilterRow venues={venueChips} selectedId={venueFilter} onSelect={setVenueFilter} />

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={shownBookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="event-available" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Confirmed Bookings</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Upcoming confirmed bookings will appear here</Text>
          </View>
        }
        renderItem={({ item: booking }) => {
          return (
          <Pressable
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
          >
            <DateBadge dateStr={booking.slot?.date ?? booking.slotDate} color={STATUS_COLORS.confirmed} />
            <View style={styles.info}>
              <Text style={[styles.djName, { color: colors.foreground }]} numberOfLines={1}>
                {booking.dj?.fullName ?? 'Unknown Artist'}
                {booking.venue?.name ? <Text style={{ color: colors.muted, fontWeight: '500' }}> / {booking.venue.name}</Text> : null}
              </Text>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
              </Text>
            </View>
          </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingVertical: 8, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  info: { flex: 1 },
  djName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  venueName: { fontSize: 13, marginBottom: 2 },
  time: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
