import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput, KeyboardAvoidingView, Platform, Linking } from '@/lib/rn';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { useBookingStore, useSlotStore, useVenueStore, useAuthStore, useNotificationStore, useCalendarJumpStore, useReviewStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import { syncBookingStatus } from '@/lib/booking-sync';
import { isPastStart } from '@/lib/utils';
import { rescheduleArtistReminders } from '@/lib/reminders';
import { Section, Divider, ListRow, IconTile, Chip, SoftButton } from '@/components/ui/card-free';

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
          // Drop any already-scheduled "gig in X hours" reminder for this gig.
          if (currentUser?.id) rescheduleArtistReminders(currentUser.id);
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
          // Drop any already-scheduled "gig in X hours" reminder for this gig.
          if (currentUser?.id) rescheduleArtistReminders(currentUser.id);
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
          {/* Venue Card — the Maps button lives INSIDE the card (below the venue info),
              matching the manager booking-detail. */}
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
          ) : booking.isArtistCreated ? (
            <>
              <Section label="Private Event">
                <ListRow
                  leading={<IconTile icon="event-note" />}
                  title={booking.slotName ?? 'Private Event'}
                  subtitle={[booking.privateEventLocation, 'Private Event'].filter(Boolean).join('\n')}
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

          {/* Slot / Day Details */}
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
          {venue && Array.isArray(venue.preferredEnergy) && venue.preferredEnergy.length > 0 ? (
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

          {/* Actions — Accept/Decline for requested + past_confirmation (not private events) */}
          {!booking.isArtistCreated && (booking.status === 'requested' || booking.status === 'past_confirmation') && (
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.acceptBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
                onPress={handleAccept}
              >
                <MaterialIcons name="check-circle" size={18} color="#000" />
                <Text style={styles.acceptBtnText}>Confirm</Text>
              </Pressable>
              <SoftButton tone="danger" icon="cancel" label="Decline" onPress={handleDecline} />
            </View>
          )}

          {/* Actions — Cancel confirmed bookings */}
          {booking.status === 'confirmed' && (
            <View style={styles.actions}>
              <SoftButton tone="danger" icon="cancel" label="Cancel Booking" onPress={handleCancelConfirmed} />
            </View>
          )}

          {/* Review Section — only for completed bookings */}
          {booking.status === 'completed' && (() => {
            const submitted = reviewSubmitted || !!existingReview;
            const displayReview = existingReview ?? (reviewSubmitted ? { rating: reviewRating, text: reviewText } : null);

            if (submitted && displayReview) {
              // Read-only view
              return (
                <>
                  <Section label="Your Review">
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <MaterialIcons
                          key={star}
                          name="star"
                          size={28}
                          color={star <= displayReview.rating ? colors.warning : colors.border}
                        />
                      ))}
                    </View>
                    {displayReview.text ? (
                      <Text style={[styles.bodyText, { color: colors.foreground, marginTop: 12 }]}>{displayReview.text}</Text>
                    ) : null}
                  </Section>
                  <Divider />
                </>
              );
            }

            // Input form
            return (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Section label="Review">
                  <Text style={[styles.reviewTitle, { color: colors.foreground, marginBottom: 12 }]}>How was this gig?</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => setReviewRating(star)} hitSlop={8}>
                        <MaterialIcons
                          name="star"
                          size={32}
                          color={star <= reviewRating ? colors.warning : colors.border}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.reviewInput, { backgroundColor: colors.surface, color: colors.foreground }]}
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
                </Section>
              </KeyboardAvoidingView>
            );
          })()}

          {/* Show on Calendar */}
          {(slot?.date ?? booking.slotDate) ? (
            <View style={styles.actions}>
              <SoftButton
                tone="primary"
                icon="event"
                label="Show on Calendar"
                onPress={() => {
                  const date = slot?.date ?? booking.slotDate ?? '';
                  if (date) {
                    useCalendarJumpStore.getState().setPendingDate(date);
                    router.push('/(artist)/(tabs)/calendar' as Href);
                  }
                }}
              />
            </View>
          ) : null}
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
  content: {},
  bodyText: { fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mapsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  mapsBadgeText: { fontSize: 13, fontWeight: '700' },
  actions: { gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  reviewTitle: { fontSize: 16, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 6 },
  reviewInput: { borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginTop: 12 },
  reviewSubmitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  reviewSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
