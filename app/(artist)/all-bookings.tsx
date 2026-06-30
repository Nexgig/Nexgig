import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useInvoiceStore, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';

// Full list of the artist's bookings — pending + confirmed + completed, all
// dates, including artist-created private events. Mirrors the dashboard
// "Bookings" preview (same card + status dot), just without the slice.
// Opened from the dashboard's "See all".
export default function AllBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);

  const allInvoices = useInvoiceStore((s) => s.invoices);
  const invoicedBookingIds = useMemo(() => new Set(
    allInvoices
      .filter((inv) => inv.artistId === currentUser?.id && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
  ), [allInvoices, currentUser?.id]);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.artistId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const list = useMemo(() => bookings
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
      const dotColor = isDone ? '#2563EB' : isPending ? '#F59E0B' : '#22C55E';
      const isInvoiced = invoicedBookingIds.has(b.id);
      return { ...b, slot: resolvedSlot, venue: resolvedVenue, dotColor, isDone, isInvoiced };
    })
    .sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? a.slotDate ?? '';
      const db = b.slot?.date ?? b.slotDate ?? '';
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    }),
    [bookings, slots, allVenues, invoicedBookingIds]
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
            <Text allowFontScaling={false} style={[styles.legendDot, { color: '#F59E0B' }]}>.</Text>
            <Text style={[styles.legendText, { color: colors.muted }]}>Pending</Text>
          </View>
          <View style={styles.legendItem}>
            <Text allowFontScaling={false} style={[styles.legendDot, { color: '#22C55E' }]}>.</Text>
            <Text style={[styles.legendText, { color: colors.muted }]}>Confirmed</Text>
          </View>
          <View style={styles.legendItem}>
            <Text allowFontScaling={false} style={[styles.legendDot, { color: '#2563EB' }]}>.</Text>
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
                      ? `${formatDate(booking.slotDate)}${booking.slotStartTime ? ` · ${formatTime(booking.slotStartTime)}–${formatTime(booking.slotEndTime ?? '')}` : ''}`
                      : booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={[styles.statusDot, { color: booking.dotColor }]}>.</Text>
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
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 26, transform: [{ translateY: -7 }] },
  legendText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  bookingCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  gigPhoto: { width: 48, height: 48, borderRadius: 24 },
  gigInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  invoicedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  invoicedChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  gigVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  gigSlot: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
});
