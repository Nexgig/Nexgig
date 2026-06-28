import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function ArtistCompletedGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const bookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);

  // Completed gigs — with slot/venue snapshot fallback. The artist's local store may not
  // hold the manager's slots, so fall back to the slotDate/slotName/... fields stored on
  // the booking record itself (same pattern as the dashboard/profile).
  const completedGigs = useMemo(() => bookings
    .filter((b) => b.artistId === currentUser?.id && (b.status === 'completed' || b.isCompleted))
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
      const resolvedVenueName = venue?.name ?? b.venueName ?? 'Unknown Venue';
      return { ...b, slot: resolvedSlot, resolvedVenueName, venue };
    })
    .sort((a, b) => ((a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1)),
    [bookings, currentUser?.id, slots, allVenues]
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
        <Text style={[styles.title, { color: colors.foreground }]}>Completed Gigs</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={completedGigs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="check-circle" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Completed Gigs</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Completed bookings will appear here</Text>
          </View>
        }
        renderItem={({ item: booking }) => {
          const venuePhoto = booking.venue ? venuePhotoUri(booking.venue) : undefined;
          return (
          <Pressable
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
          >
            {venuePhoto ? (
              <Image source={{ uri: venuePhoto }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                <MaterialIcons name="place" size={20} color={colors.muted} />
              </View>
            )}
            <View style={styles.info}>
              <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
                {booking.resolvedVenueName}
              </Text>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {booking.slot
                  ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}`
                  : ''}
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
  list: { paddingHorizontal: 20, paddingVertical: 8, gap: 2, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  photo: { width: 48, height: 48, borderRadius: 24 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  venueName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  time: { fontSize: 13 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
