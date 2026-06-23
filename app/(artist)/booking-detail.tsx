import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { useBookingStore, useSlotStore, useVenueStore, useAuthStore, useNotificationStore, useCalendarJumpStore, useReviewStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { syncBookingStatus } from '@/lib/booking-sync';
import { isPastStart } from '@/lib/utils';

export default function DJBookingDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);

  // Review state
  const addReview = useReviewStore((s) => s.addReview);
  const getReviewByBooking = useReviewStore((s) => s.getReviewByBooking);
  const existingReview = id ? getReviewByBooking(id) : undefined;
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === id));
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromCalendar = useBookingStore((s) => s.hideFromCalendar);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markNotifAsRead = useNotificationStore((s) => s.markAsRead);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Helper: send a notification to the manager
  const notifyManager = (type: 'booking_confirmed' | 'booking_declined' | 'booking_cancelled') => {
    if (!booking || !currentUser) return;
    const venueName = venue?.name ?? booking.venueName ?? 'a venue';
    const date = slot?.date ?? booking.slotDate ?? '';
    const titles: Record<string, string> = {
      booking_confirmed: 'Booking Confirmed',
      booking_declined: 'Booking Declined',
      booking_cancelled: 'Booking Cancelled',
    };
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: booking.managerId,
      type,
      title: titles[type],
      body: `${currentUser.fullName} · ${venueName} — ${date ? formatDate(date) : ''}`,
      isRead: false,
      relatedId: booking.id,
      relatedType: 'booking',
      createdAt: new Date().toISOString(),
    });
  };

  // Helper: mark any unread notification related to a booking as read
  const markRelatedNotificationsRead = (bookingId: string) => {
    allNotifications
      .filter(
        (n) =>
          n.userId === currentUser?.id &&
          !n.isRead &&
          n.relatedId === bookingId &&
          n.relatedType === 'booking'
      )
      .forEach((n) => markNotifAsRead(n.id));
  };

  if (!booking) {
    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(artist)/(tabs)/calendar' as Href));
    return (
      <ScreenContainer>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
        </View>
        <View style={styles.center}>
          <MaterialIcons name="event-busy" size={48} color={colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', marginTop: 12 }}>Booking not found</Text>
          <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 4 }}>This booking may have been cancelled or removed.</Text>
          <Pressable onPress={goBack} style={({ pressed }) => [{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const slot = getSlotById(booking.slotId);
  const venue = getVenueById(booking.venueId);

  const handleAccept = () => {
    const bookingDate = slot?.date ?? booking.slotDate ?? '';
    const isPast = bookingDate !== '' && isPastStart(bookingDate, slot?.startTime ?? booking.slotStartTime ?? '23:59');

    if (isPast) {
      // Past booking — confirm goes directly to completed
      Alert.alert(
        'Confirm Past Gig',
        `Confirm that you performed at ${venue?.name ?? 'this venue'} on ${bookingDate ? formatDate(bookingDate) : 'this date'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: () => {
              const now = new Date().toISOString();
              updateBookingStatus(booking.id, 'completed', {
                isCompleted: true,
                confirmedAt: now,
                updatedAt: now,
                artistRespondedFromRequests: true,
                slotDate: slot?.date ?? booking.slotDate,
                slotName: slot?.name ?? booking.slotName,
                slotStartTime: slot?.startTime ?? booking.slotStartTime,
                slotEndTime: slot?.endTime ?? booking.slotEndTime,
                venueName: venue?.name ?? booking.venueName,
              });
              syncBookingStatus(booking.id, 'completed', { isCompleted: true, confirmedAt: now });
              markRelatedNotificationsRead(booking.id);
              notifyManager('booking_confirmed');
              router.back();
            },
          },
        ]
      );
    } else {
      // Future booking — normal confirm flow
      Alert.alert('Accept Booking', 'Confirm this booking?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept', onPress: () => {
            updateBookingStatus(booking.id, 'confirmed', { confirmedAt: new Date().toISOString(), artistRespondedFromRequests: true });
            syncBookingStatus(booking.id, 'confirmed', { confirmedAt: new Date().toISOString() });
            markRelatedNotificationsRead(booking.id);
            notifyManager('booking_confirmed');
            router.back();
          }
        },
      ]);
    }
  };

  const handleDecline = () => {
    Alert.alert('Decline Booking', 'Are you sure you want to decline?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'declined', { artistRespondedFromRequests: true });
          hideFromCalendar(booking.id);
          syncBookingStatus(booking.id, 'declined', { hiddenFromCalendar: true });
          markRelatedNotificationsRead(booking.id);
          notifyManager('booking_declined');
          router.back();
        }
      },
    ]);
  };

  const handleCancelConfirmed = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this confirmed booking? The manager will be notified.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Booking', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'cancelled', { cancelledAt: new Date().toISOString(), cancelledByArtist: true, artistRespondedFromRequests: true });
          syncBookingStatus(booking.id, 'cancelled', { cancelledAt: new Date().toISOString() });
          markRelatedNotificationsRead(booking.id);
          notifyManager('booking_cancelled');
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
          {/* Venue Card */}
          {venue ? (
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
          ) : booking.isArtistCreated ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="event-note" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{booking.slotName ?? 'Private Event'}</Text>
                {booking.privateEventLocation ? (
                  <Text style={[styles.cardSub, { color: colors.muted }]}>{booking.privateEventLocation}</Text>
                ) : null}
                <Text style={[styles.cardSub, { color: colors.muted }]}>Private Event</Text>
              </View>
            </View>
          ) : booking.venueName ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="business" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{booking.venueName}</Text>
              </View>
            </View>
          ) : null}

          {/* Slot / Day Details */}
          {slot ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="event" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{formatDate(slot.date)}</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</Text>
              </View>
            </View>
          ) : (booking.slotDate || booking.slotStartTime) ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
                <MaterialIcons name="schedule" size={22} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                {booking.slotDate ? (
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{formatDate(booking.slotDate)}</Text>
                ) : null}
                {booking.slotStartTime && booking.slotEndTime ? (
                  <Text style={[styles.cardSub, { color: colors.muted }]}>{formatTime(booking.slotStartTime)} – {formatTime(booking.slotEndTime)}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Venue Vibe */}
          {venue && venue.vibeDescription && (
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.notesLabel, { color: colors.muted }]}>Venue Vibe</Text>
              <Text style={[styles.notesText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
            </View>
          )}

          {/* Venue Energy */}
          {venue && Array.isArray(venue.preferredEnergy) && venue.preferredEnergy.length > 0 && (
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

          {/* Actions — DJ: Accept/Decline for requested and past_confirmation bookings (not for private events) */}
          {!booking.isArtistCreated && (booking.status === 'requested' || booking.status === 'past_confirmation') && (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.acceptBtn, { opacity: pressed ? 0.8 : 1 }]}
                onPress={handleAccept}
              >
                <MaterialIcons name="check-circle" size={18} color="#000" />
                <Text style={styles.acceptBtnText}>Confirm</Text>
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

          {/* Actions — DJ: Cancel confirmed bookings */}
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

          {/* Review Section — only for completed bookings */}
          {booking.status === 'completed' && (() => {
            const submitted = reviewSubmitted || !!existingReview;
            const displayReview = existingReview ?? (reviewSubmitted ? { rating: reviewRating, text: reviewText } : null);

            if (submitted && displayReview) {
              // Read-only view
              return (
                <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Your Review</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <MaterialIcons
                        key={star}
                        name="star"
                        size={28}
                        color={star <= displayReview.rating ? '#F59E0B' : colors.border}
                      />
                    ))}
                  </View>
                  {displayReview.text ? (
                    <Text style={[styles.reviewReadText, { color: colors.foreground }]}>{displayReview.text}</Text>
                  ) : null}
                </View>
              );
            }

            // Input form
            return (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.reviewTitle, { color: colors.foreground }]}>How was this gig?</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => setReviewRating(star)} hitSlop={8}>
                        <MaterialIcons
                          name="star"
                          size={32}
                          color={star <= reviewRating ? '#F59E0B' : colors.border}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.reviewInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Share your experience..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    value={reviewText}
                    onChangeText={setReviewText}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={({ pressed }) => [styles.reviewSubmitBtn, { backgroundColor: reviewRating === 0 ? colors.muted : colors.primary, opacity: pressed ? 0.85 : 1 }]}
                    onPress={() => {
                      if (reviewRating === 0) {
                        Alert.alert('Rating required', 'Please select at least 1 star.');
                        return;
                      }
                      addReview({
                        id: `review-${Date.now()}`,
                        bookingId: booking.id,
                        artistId: currentUser?.id ?? '',
                        rating: reviewRating,
                        text: reviewText.trim() || undefined,
                        createdAt: new Date().toISOString(),
                      });
                      // Notify the manager
                      if (booking.managerId) {
                        addNotification({
                          id: `notif-review-${Date.now()}`,
                          userId: booking.managerId,
                          type: 'review_submitted',
                          title: 'New Gig Review',
                          body: `${currentUser?.fullName ?? 'An artist'} · ${reviewRating}★`,
                          relatedId: booking.id,
                          relatedType: 'booking',
                          isRead: false,
                          createdAt: new Date().toISOString(),
                        });
                      }
                      setReviewSubmitted(true);
                    }}
                  >
                    <Text style={styles.reviewSubmitText}>Submit Review</Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
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
                  router.push('/(artist)/(tabs)/calendar' as Href);
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  reviewInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  reviewReadText: { fontSize: 14, lineHeight: 21 },
  reviewSubmitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  reviewSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
