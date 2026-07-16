import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Linking, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Section, Divider, ListRow, IconTile, Chip, SoftButton } from '@/components/ui/card-free';
import { useBookingStore, useSlotStore, useVenueStore, useAuthStore, useReviewStore, useLineupStore } from '@/lib/store';
import type { Href } from 'expo-router';
import { venueImageFor } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import type { } from '@/lib/types';

/** Venue image at IconTile's size/radius. Derived from the venue TYPE, so it always
 *  resolves — and it falls back to the type snapshotted on the booking, since the
 *  venue row can be unreadable (artist disconnected, venue hidden). */
function VenueThumb({ venue, snapshotType }: { venue?: { venueType?: string } | null; snapshotType?: string }) {
  return <Image source={venueImageFor(venue, snapshotType)} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="cover" />;
}

/** A label/value row, borrowed from the invoice's document language. No icon — an
 *  agreement states facts, it doesn't decorate them. `last` drops the hairline. */
function DetailRow({ label, value, trailing, last = false }: {
  label: string; value?: string; trailing?: React.ReactNode; last?: boolean;
}) {
  const colors = useColors();
  if (!value && !trailing) return null;
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2 }]}>
      <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
      <View style={styles.detailValueWrap}>
        {value ? <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

/** Compact "Maps" badge — ink on a grey surface, so it reads as a control rather than
 *  competing with the coral used for status. Replaces the old full-width
 *  "Open in Google Maps" row. */
function MapsBadge({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.mapsBadge, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      <MaterialIcons name="directions" size={15} color={colors.foreground} />
      <Text style={[styles.mapsBadgeText, { color: colors.foreground }]}>Maps</Text>
    </Pressable>
  );
}

export default function DJBookingDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { formatTime: fmtTime } = useFormatTime();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const getReviewByBooking = useReviewStore((s) => s.getReviewByBooking);

  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === id));
  const allBookings = useBookingStore((s) => s.bookings);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  if (!booking) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Booking not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const slot = getSlotById(booking.slotId);
  const venue = getVenueById(booking.venueId);
  // Artist shown to the manager. getArtistUser returns a "Former Artist"
  // placeholder when the artist_id is null (account deleted).
  const artistUser = getArtistUser(booking.artistId);

  // Other artists booked on the SAME slot (a slot can hold a multi-artist lineup).
  // Manager-only: lets them see/switch between everyone on this gig.
  // Co-artists on this set. A cancelled or declined booking means that artist is no
  // longer on it, so they must drop out of the list — otherwise a manager who
  // cancels someone (or an artist who declines) still sees them here.
  const coBookings = allBookings.filter(
    (b) =>
      b.slotId === booking.slotId &&
      b.id !== booking.id &&
      b.status !== 'cancelled' &&
      b.status !== 'declined'
  );

  const isManager = currentUser?.accountType === 'manager';
  const isDJ = currentUser?.accountType === 'artist';

  const handleAccept = () => {
    Alert.alert('Accept Booking', 'Confirm this booking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept', onPress: () => {
          updateBookingStatus(booking.id, 'confirmed', { confirmedAt: new Date().toISOString() });
          router.back();
        }
      },
    ]);
  };

  const handleDecline = () => {
    Alert.alert('Decline Booking', 'Are you sure you want to decline?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'declined');
          router.back();
        }
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'cancelled', {
            cancelledAt: new Date().toISOString(),
            cancellationAcknowledged: true,
            cancelledAsRequest: true,
          });
          router.back();
        }
      },
    ]);
  };



  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
        </View>

        <View style={styles.content}>
          {/* Artist(s) on this booking's slot. Manager-only. */}
          {isManager && (
            <>
              <Section label={coBookings.length > 0 ? 'Artists' : 'Artist'}>
                <ListRow
                  leading={<AvatarImage uri={artistUser?.profilePhotoUrl} avatarId={(artistUser as any)?.avatarId} seed={artistUser?.id} name={artistUser?.fullName ?? 'Former Artist'} size={44} />}
                  title={artistUser?.fullName ?? 'Former Artist'}
                  subtitle="Artist"
                  trailing={<StatusBadge status={booking.status} />}
                  divider={coBookings.length > 0}
                />
                {coBookings.map((cb, i) => {
                  const coArtist = getArtistUser(cb.artistId);
                  return (
                    <ListRow
                      key={cb.id}
                      leading={<AvatarImage uri={coArtist?.profilePhotoUrl} avatarId={(coArtist as any)?.avatarId} seed={coArtist?.id} name={coArtist?.fullName ?? 'Former Artist'} size={44} />}
                      title={coArtist?.fullName ?? 'Former Artist'}
                      subtitle="Also on this slot"
                      trailing={<StatusBadge status={cb.status} />}
                      onPress={() => router.replace(('/(manager)/booking-detail?id=' + cb.id) as Href)}
                      divider={i < coBookings.length - 1}
                    />
                  );
                })}
              </Section>
            </>
          )}

          {/* Venue Card — falls back to the booking's venueName snapshot when the venue
              has been deleted, so completed-gig history keeps the real venue name.
              The Maps button lives INSIDE the card (below the venue info). */}
          {venue ? (
            <>
              <Section label="Venue">
                <ListRow
                  leading={<VenueThumb venue={venue} snapshotType={booking.venueType} />}
                  title={venue.name}
                  subtitle={[venue.venueType, venue.googleMapsLocation?.address ? cityFromAddress(venue.googleMapsLocation.address) : undefined].filter(Boolean).join('\n') || undefined}
                  divider={false}
                />
              </Section>
            </>
          ) : booking.venueName ? (
            <>
              <Section label="Venue">
                <ListRow leading={<VenueThumb snapshotType={booking.venueType} />} title={booking.venueName} divider={false} />
              </Section>
            </>
          ) : null}

          {/* Details — document-style label/value table. Replaces the icon-tile rows:
              the coral tiles added colour but said nothing the label didn't. */}
          <Section label="Details">
            <DetailRow label="DATE" value={slot ? formatDate(slot.date) : (booking.slotDate ? formatDate(booking.slotDate) : undefined)} />
            <DetailRow
              label="TIME"
              value={
                slot
                  ? `${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`
                  : (booking.slotStartTime && booking.slotEndTime ? `${fmtTime(booking.slotStartTime)} – ${fmtTime(booking.slotEndTime)}` : undefined)
              }
            />
            <DetailRow label="VENUE TYPE" value={venue?.venueType} />
            <DetailRow
              label="LOCATION"
              value={venue?.googleMapsLocation?.address}
              last
              trailing={
                venue?.googleMapsLocation?.address ? (
                  <MapsBadge
                    onPress={() => {
                      const loc = venue.googleMapsLocation;
                      const url = (loc?.lat && loc?.lng)
                        ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
                        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue.name || '')}`;
                      Linking.openURL(url);
                    }}
                  />
                ) : undefined
              }
            />
          </Section>

          <Divider />

          {/* Venue Vibe */}
          {venue && venue.vibeDescription ? (
            <>
              <Section label="Venue Vibe">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
              </Section>
            </>
          ) : null}

          {/* Venue Energy */}
          {venue && venue.preferredEnergy.length > 0 ? (
            <>
              <Section label="Expected Energy">
                <View style={styles.chips}>
                  {venue.preferredEnergy.map((e) => <Chip key={e} label={e} />)}
                </View>
              </Section>
            </>
          ) : null}

          {/* Venue Rules */}
          {venue?.rulesTemplate ? (
            <>
              <Section label="Venue Rules">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
              </Section>
            </>
          ) : null}

          {/* Artist Review — read-only for manager */}
          {booking.status === 'completed' && (() => {
            const review = getReviewByBooking(booking.id);
            if (!review) return (
              <>
                <Section label="Review">
                  <Text style={[styles.reviewTitle, { color: colors.foreground }]}>No review yet</Text>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>The artist hasn&apos;t reviewed this gig yet.</Text>
                </Section>
                <Divider />
              </>
            );
            return (
              <>
                <Section label="Artist Review">
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <MaterialIcons
                        key={star}
                        name="star"
                        size={28}
                        color={star <= review.rating ? colors.warning : colors.border}
                      />
                    ))}
                  </View>
                  {review.text ? (
                    <Text style={[styles.bodyText, { color: colors.foreground, marginTop: 12 }]}>{review.text}</Text>
                  ) : null}
                </Section>
                <Divider />
              </>
            );
          })()}

          {/* Actions */}
          <View style={styles.actions}>
            {booking.status === 'requested' && isDJ && (
              <>
                <Pressable
                  style={({ pressed }) => [styles.acceptBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
                  onPress={handleAccept}
                >
                  <MaterialIcons name="check-circle" size={18} color="#000" />
                  <Text style={styles.acceptBtnText}>Accept Booking</Text>
                </Pressable>
                <SoftButton tone="danger" icon="cancel" label="Decline" onPress={handleDecline} />
              </>
            )}

            {booking.status === 'confirmed' && (
              <SoftButton tone="danger" icon="cancel" label="Cancel Booking" onPress={handleCancel} />
            )}

          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  detailLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, width: 92 },
  detailValueWrap: { flex: 1 },
  detailValue: { fontSize: 14, lineHeight: 20 },
  content: {},
  bodyText: { fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mapsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  mapsBadgeText: { fontSize: 13, fontWeight: '700' },
  reviewTitle: { fontSize: 16, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 6 },
  actions: { gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
