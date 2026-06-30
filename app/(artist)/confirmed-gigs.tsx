import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { isUpcoming, nowLocalDateTimeStr } from '@/lib/utils';

export default function ArtistConfirmedGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);

  const nowDT = nowLocalDateTimeStr();

  const confirmedGigs = useMemo(() => {
    return allBookings
      .filter((b) => b.artistId === currentUser?.id && b.status === 'confirmed' && !b.isCompleted)
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId, venueId: b.venueId, date: b.slotDate,
          name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
        } : undefined);
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
        return { ...b, slot: resolvedSlot, venue: resolvedVenue };
      })
      .filter((b) => b.slot && isUpcoming(b.slot.date, b.slot.startTime))
      .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1);
  }, [allBookings, currentUser?.id, slots, allVenues, nowDT]);

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
        <Text style={[styles.title, { color: colors.foreground }]}>Confirmed Gigs</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={confirmedGigs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="event-available" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Confirmed Gigs</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Your upcoming confirmed gigs will appear here</Text>
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
                {booking.venue?.name ?? 'Unknown Venue'}
              </Text>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.statusDot, { color: '#22C55E' }]}>.</Text>
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
  venueIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1 },
  venueName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  slotName: { fontSize: 13, marginBottom: 2 },
  time: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
