import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, useInvoiceStore, useReviewStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function CompletedGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const reviews = useReviewStore((s) => s.reviews);
  // bookingId -> rating, so a reviewed gig is visible at a glance in the list
  const reviewByBooking = useMemo(
    () => new Map(reviews.map((r) => [r.bookingId, r.rating])),
    [reviews]
  );
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);

  const allInvoices = useInvoiceStore((s) => s.invoices);
  // bookingId -> invoiceId, so the "Invoiced" chip can open the actual invoice.
  const invoiceByBooking = useMemo(() => {
    const m = new Map<string, string>();
    allInvoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.status !== 'cancelled')
      .forEach((inv) => inv.gigs.forEach((g) => m.set(g.bookingId, inv.id)));
    return m;
  }, [allInvoices, currentUser?.id]);

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
        return { ...b, slot, dj, venue, isInvoiced: invoiceByBooking.has(b.id), invoiceId: invoiceByBooking.get(b.id) };
      })
      .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1);
  }, [allBookings, currentUser?.id, slots, artistUsers, allVenues, invoiceByBooking]);

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
        ItemSeparatorComponent={() => <Divider full />}
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
          const rating = reviewByBooking.get(booking.id);
          return (
          <Pressable
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
          >
            <AvatarImage uri={booking.dj?.profilePhotoUrl} avatarId={(booking.dj as any)?.avatarId} seed={(booking.dj as any)?.id} name={booking.dj?.fullName} size={48} variant="artist" />
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <Text style={[styles.djName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                  {booking.dj?.fullName ?? 'Unknown Artist'}
                  {booking.venue?.name ? <Text style={{ color: colors.muted, fontWeight: '500' }}> / {booking.venue.name}</Text> : null}
                </Text>
                {rating !== undefined && (
                  <View style={[styles.reviewChip, { backgroundColor: colors.warning + '1A' }]}>
                    <MaterialIcons name="star" size={12} color={colors.warning} />
                    <Text style={[styles.reviewChipText, { color: colors.warning }]}>{rating}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {booking.slot ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}` : ''}
              </Text>
            </View>
            {booking.isInvoiced ? (
              <Pressable
                onPress={() => booking.invoiceId && router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId: booking.invoiceId } })}
                hitSlop={8}
                style={({ pressed }) => [styles.invoicedChip, { backgroundColor: colors.primary + '1A', opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
              </Pressable>
            ) : null}
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
  photo: { width: 48, height: 48, borderRadius: 24 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  invoicedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0, marginLeft: 6 },
  reviewChip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  reviewChipText: { fontSize: 10, fontWeight: '700' },
  invoicedChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  djName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  venueName: { fontSize: 13, marginBottom: 2 },
  time: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
