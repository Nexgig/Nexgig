import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useBookingStore, useSlotStore, useVenueStore, useNotificationStore, useAuthStore, useCalendarJumpStore, useReviewStore, useLineupStore } from '@/lib/store';
import type { Href } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import type { } from '@/lib/types';
import { syncBookingStatus } from '@/lib/booking-sync';

export default function DJBookingDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const getReviewByBooking = useReviewStore((s) => s.getReviewByBooking);

  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === id));
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
          {/* Artist Card — shown to the manager so they can see who the booking is with */}
          {isManager && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AvatarImage uri={artistUser?.profilePhotoUrl} name={artistUser?.fullName ?? 'Former Artist'} size={44} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{artistUser?.fullName ?? 'Former Artist'}</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>Artist</Text>
              </View>
            </View>
          )}

          {/* Venue Card */}
          {venue && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="business" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{venue.name}</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>{venue.venueType}</Text>
                {venue.googleMapsLocation?.address && (
                  <Text style={[styles.cardSub, { color: colors.muted }]}>{venue.googleMapsLocation.address}</Text>
                )}
              </View>
            </View>
          )}

          {/* Slot Details */}
          {slot && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="event" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{slot.name}</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>{formatDate(slot.date)}</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</Text>
              </View>
            </View>
          )}

          {/* Venue Vibe */}
          {venue && venue.vibeDescription && (
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.notesLabel, { color: colors.muted }]}>Venue Vibe</Text>
              <Text style={[styles.notesText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
            </View>
          )}

          {/* Venue Energy */}
          {venue && venue.preferredEnergy.length > 0 && (
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.notesLabel, { color: colors.muted }]}>Expected Energy</Text>
              <View style={styles.chips}>
                {venue.preferredEnergy.map((e) => (
                  <View key={e} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.foreground }]}>{e}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Venue Rules */}
          {venue?.rulesTemplate && (
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.notesLabel, { color: colors.muted }]}>Venue Rules</Text>
              <Text style={[styles.notesText, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
            </View>
          )}

          {/* Actions — DJ: Accept/Decline for requested bookings */}
          {booking.status === 'requested' && isDJ && (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.acceptBtn, { opacity: pressed ? 0.8 : 1 }]}
                onPress={handleAccept}
              >
                <MaterialIcons name="check-circle" size={18} color="#000" />
                <Text style={styles.acceptBtnText}>Accept Booking</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.declineBtn, { borderColor: colors.error, opacity: pressed ? 0.8 : 1 }]}
                onPress={handleDecline}
              >
                <MaterialIcons name="cancel" size={18} color={colors.error} />
                <Text style={[styles.declineBtnText, { color: colors.error }]}>Decline</Text>
              </Pressable>
            </View>
          )}

          {/* Actions — Manager: Cancel Request for pending bookings */}
          {booking.status === 'requested' && isManager && (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.declineBtn, { borderColor: colors.error, opacity: pressed ? 0.8 : 1 }]}
                onPress={handleCancelRequest}
              >
                <MaterialIcons name="cancel" size={18} color={colors.error} />
                <Text style={[styles.declineBtnText, { color: colors.error }]}>Cancel Request</Text>
              </Pressable>
            </View>
          )}

          {/* Actions — Both: Cancel confirmed bookings */}
          {booking.status === 'confirmed' && (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.declineBtn, { borderColor: colors.error, opacity: pressed ? 0.8 : 1 }]}
                onPress={handleCancelConfirmed}
              >
                <MaterialIcons name="cancel" size={18} color={colors.error} />
                <Text style={[styles.declineBtnText, { color: colors.error }]}>Cancel Booking</Text>
              </Pressable>
            </View>
          )}
        {/* Artist Review — read-only for manager */}
          {booking.status === 'completed' && (() => {
            const review = getReviewByBooking(booking.id);
            if (!review) return (
              <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.reviewTitle, { color: colors.muted }]}>No review yet</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>The artist hasn't reviewed this gig yet.</Text>
              </View>
            );
            return (
              <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Artist Review</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <MaterialIcons
                      key={star}
                      name="star"
                      size={28}
                      color={star <= review.rating ? '#F59E0B' : colors.border}
                    />
                  ))}
                </View>
                {review.text ? (
                  <Text style={[styles.reviewReadText, { color: colors.foreground }]}>{review.text}</Text>
                ) : null}
              </View>
            );
          })()}

          {/* Show on Calendar */}
          {(slot?.date ?? booking.slotDate) && (
            <Pressable
              style={({ pressed }) => [styles.calendarBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => {
                const date = slot?.date ?? booking.slotDate ?? '';
                if (date) {
                  useCalendarJumpStore.getState().setPendingDate(date);
                  router.push('/(manager)/(tabs)/calendar' as Href);
                }
              }}
            >
              <MaterialIcons name="event" size={18} color={colors.primary} />
              <Text style={[styles.calendarBtnText, { color: colors.primary }]}>Show on Calendar</Text>
            </Pressable>
          )}
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
  content: { padding: 20, gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 13, lineHeight: 18 },
  notesCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  notesLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  notesText: { fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '500' },
  actions: { gap: 12, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  acceptBtn: { backgroundColor: '#22C55E' },
  acceptBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  declineBtn: { borderWidth: 1.5, backgroundColor: 'transparent' },
  declineBtnText: { fontSize: 15, fontWeight: '700' },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 14, marginTop: 4 },
  calendarBtnText: { fontSize: 15, fontWeight: '600' },
  reviewCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12, marginTop: 4 },
  reviewTitle: { fontSize: 16, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 6 },
  reviewReadText: { fontSize: 14, lineHeight: 21 },
});
