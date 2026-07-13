import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Linking } from '@/lib/rn';
import { useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Section, Divider, ListRow, IconTile, Chip, SoftButton } from '@/components/ui/card-free';
import { useBookingStore, useSlotStore, useVenueStore, useNotificationStore, useAuthStore, useCalendarJumpStore, useReviewStore, useLineupStore } from '@/lib/store';
import type { Href } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import type { } from '@/lib/types';
import { syncBookingStatus } from '@/lib/booking-sync';

/** Compact coral "Maps" badge — replaces the old full-width "Open in Google Maps" row. */
function MapsBadge({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.mapsBadge, { backgroundColor: colors.primary + '20', opacity: pressed ? 0.7 : 1 }]}
    >
      <MaterialIcons name="directions" size={15} color={colors.primary} />
      <Text style={[styles.mapsBadgeText, { color: colors.primary }]}>Maps</Text>
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
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const addNotification = useNotificationStore((s) => s.addNotification);

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
  const coBookings = allBookings.filter((b) => b.slotId === booking.slotId && b.id !== booking.id);

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

  const handleCancelRequest = () => {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this gig request?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Request', style: 'destructive', onPress: () => {
          // Set cancellationAcknowledged so booking goes directly to Cancelled tab (no Dismiss step)
          updateBookingStatus(booking.id, 'cancelled', { cancelledAt: new Date().toISOString(), cancellationAcknowledged: true, cancelledAsRequest: true });
          syncBookingStatus(booking.id, 'cancelled', { cancelledAt: new Date().toISOString(), cancellationAcknowledged: true, cancelledAsRequest: true });
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: booking.artistId,
            type: 'booking_request_cancelled',
            title: 'Request Cancelled',
            body: `${venue?.name ?? booking.venueName ?? 'a venue'} — ${slot?.date ? formatDate(slot.date) : (booking.slotDate ? formatDate(booking.slotDate) : '')}`,
            isRead: false,
            relatedId: booking.id,
            relatedType: 'booking',
            createdAt: new Date().toISOString(),
          });
          router.back();
        }
      },
    ]);
  };

  const handleCancelConfirmed = () => {
    Alert.alert('Cancel Booking', 'This booking is confirmed. Are you sure you want to cancel it?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Booking', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'cancelled', {
            cancelledAt: new Date().toISOString(),
            slotDate: slot?.date ?? booking.slotDate,
            slotName: slot?.name ?? booking.slotName,
            slotStartTime: slot?.startTime ?? booking.slotStartTime,
            slotEndTime: slot?.endTime ?? booking.slotEndTime,
            venueName: venue?.name ?? booking.venueName,
          });
          syncBookingStatus(booking.id, 'cancelled', { cancelledAt: new Date().toISOString() });
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: booking.artistId,
            type: 'booking_cancelled',
            title: 'Booking Cancelled',
            body: `${venue?.name ?? booking.venueName ?? 'a venue'} — ${slot?.date ? formatDate(slot.date) : (booking.slotDate ? formatDate(booking.slotDate) : '')}`,
            isRead: false,
            relatedId: booking.id,
            relatedType: 'booking',
            createdAt: new Date().toISOString(),
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
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
          <StatusBadge status={booking.status} />
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
              <Divider />
            </>
          )}

          {/* Venue Card — falls back to the booking's venueName snapshot when the venue
              has been deleted, so completed-gig history keeps the real venue name.
              The Maps button lives INSIDE the card (below the venue info). */}
          {venue ? (
            <>
              <Section label="Venue">
                <ListRow
                  leading={<IconTile icon="business" />}
                  title={venue.name}
                  subtitle={[venue.venueType, venue.googleMapsLocation?.address ? cityFromAddress(venue.googleMapsLocation.address) : undefined].filter(Boolean).join('\n') || undefined}
                  trailing={
                    (venue?.googleMapsLocation?.address || (venue?.googleMapsLocation?.lat && venue?.googleMapsLocation?.lng) || venue?.name) ? (
                      <MapsBadge
                        onPress={() => {
                          const loc = venue?.googleMapsLocation;
                          const url = (loc?.lat && loc?.lng)
                            ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
                            : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue?.name || '')}`;
                          Linking.openURL(url);
                        }}
                      />
                    ) : undefined
                  }
                  divider={false}
                />
              </Section>
              <Divider />
            </>
          ) : booking.venueName ? (
            <>
              <Section label="Venue">
                <ListRow leading={<IconTile icon="business" />} title={booking.venueName} divider={false} />
              </Section>
              <Divider />
            </>
          ) : null}

          {/* Slot Details — snapshot fallback when the slot is gone (deleted venue) */}
          {slot ? (
            <>
              <Section label="Date & Time">
                <ListRow
                  leading={<IconTile icon="event" />}
                  title={formatDate(slot.date)}
                  subtitle={`${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`}
                  divider={false}
                />
              </Section>
              <Divider />
            </>
          ) : (booking.slotDate || booking.slotStartTime) ? (
            <>
              <Section label="Date & Time">
                <ListRow
                  leading={<IconTile icon="schedule" />}
                  title={booking.slotDate ? formatDate(booking.slotDate) : ''}
                  subtitle={booking.slotStartTime && booking.slotEndTime ? `${fmtTime(booking.slotStartTime)} – ${fmtTime(booking.slotEndTime)}` : undefined}
                  divider={false}
                />
              </Section>
              <Divider />
            </>
          ) : null}

          {/* Venue Vibe */}
          {venue && venue.vibeDescription ? (
            <>
              <Section label="Venue Vibe">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
              </Section>
              <Divider />
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
              <Divider />
            </>
          ) : null}

          {/* Venue Rules */}
          {venue?.rulesTemplate ? (
            <>
              <Section label="Venue Rules">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
              </Section>
              <Divider />
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

            {booking.status === 'requested' && isManager && (
              <SoftButton tone="danger" icon="cancel" label="Cancel Request" onPress={handleCancelRequest} />
            )}

            {booking.status === 'confirmed' && (
              <SoftButton tone="danger" icon="cancel" label="Cancel Booking" onPress={handleCancelConfirmed} />
            )}

            {(slot?.date ?? booking.slotDate) ? (
              <SoftButton
                tone="primary"
                icon="event"
                label="Show on Calendar"
                onPress={() => {
                  const date = slot?.date ?? booking.slotDate ?? '';
                  if (date) {
                    useCalendarJumpStore.getState().setPendingDate(date);
                    router.push('/(manager)/(tabs)/calendar' as Href);
                  }
                }}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
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
