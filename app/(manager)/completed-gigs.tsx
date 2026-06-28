import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function CompletedGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);

  const completedGigs = useMemo(() => {
    return allBookings
      .filter((b) => b.managerId === currentUser?.id && b.status === 'completed')
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        // Null artist_id means the artist deleted their account → show "Former Artist".
        const dj = b.artistId == null
          ? { fullName: 'Former Artist', profilePhotoUrl: undefined }
          : artistUsers.find((u) => u.id === b.artistId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        return { ...b, slot, dj, venue };
      })
      .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1);
  }, [allBookings, currentUser?.id, slots, artistUsers, allVenues]);

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
            onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
          >
            {venuePhoto ? (
              <Image source={{ uri: venuePhoto }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                <MaterialIcons name="place" size={20} color={colors.muted} />
              </View>
            )}
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
  list: { paddingHorizontal: 20, paddingVertical: 8, gap: 2, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  photo: { width: 48, height: 48, borderRadius: 24 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  info: { flex: 1 },
  djName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  venueName: { fontSize: 13, marginBottom: 2 },
  time: { fontSize: 13 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
