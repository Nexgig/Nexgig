import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

// Full list of the manager's bookings — pending + confirmed + completed, all
// dates. Mirrors the dashboard "Bookings" preview (same card + status dot),
// just without the slice. Opened from the dashboard's "See all".
export default function AllBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const artistUsers = useLineupStore((s) => s.artistUsers);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.managerId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const list = useMemo(() => bookings
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
      const dotColor = isDone ? '#2563EB' : isPending ? '#F59E0B' : '#22C55E';
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue, dotColor, isDone };
    })
    .sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? '';
      const db = b.slot?.date ?? '';
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    }),
    [bookings, slots, artistUsers, allVenues]
  );

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Bookings</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>All your pending, confirmed, and completed bookings.</Text>
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Pending</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Confirmed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statusDot, { backgroundColor: '#2563EB' }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>Completed</Text>
          </View>
        </View>

        {list.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="event" size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
          </View>
        ) : (
          list.map((booking) => {
            const venuePhoto = booking.venue ? venuePhotoUri(booking.venue) : undefined;
            return (
              <Pressable
                key={booking.id}
                style={({ pressed }) => [styles.bookingCard, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
              >
                {venuePhoto ? (
                  <Image source={{ uri: venuePhoto }} style={styles.gigPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.gigPhoto, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialIcons name="place" size={20} color={colors.muted} />
                  </View>
                )}
                <View style={styles.gigInfo}>
                  <Text style={[styles.bookingDJ, { color: colors.foreground }]} numberOfLines={1}>
                    {booking.dj?.fullName ?? 'Unknown Artist'}
                    {booking.venue?.name ? <Text style={{ color: colors.muted, fontWeight: '500' }}> / {booking.venue.name}</Text> : null}
                  </Text>
                  <Text style={[styles.bookingSub, { color: colors.muted }]} numberOfLines={1}>
                    {booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: booking.dotColor }]} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start', padding: 4 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  legendRow: { flexDirection: 'row', gap: 18, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  bookingCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  gigPhoto: { width: 48, height: 48, borderRadius: 24 },
  gigInfo: { flex: 1 },
  bookingDJ: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  bookingSub: { fontSize: 13 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 10 },
});
