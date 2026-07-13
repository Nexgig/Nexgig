import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useNotificationStore, venuePhotoUri } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function ArtistPendingRequestsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const rawBookings = useBookingStore((s) => s.bookings);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromCalendar = useBookingStore((s) => s.hideFromCalendar);
  const acknowledgeCancellation = useBookingStore((s) => s.acknowledgeCancellation);
  const slots = useSlotStore((s) => s.slots);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Helper: send a notification to the manager
  const notifyManager = (managerId: string, type: 'booking_confirmed' | 'booking_declined' | 'booking_cancelled', bookingId: string, venueName: string, date: string) => {
    const artistName = currentUser?.fullName ?? 'The artist';
    const titles: Record<string, string> = {
      booking_confirmed: 'Booking Confirmed',
      booking_declined: 'Booking Declined',
      booking_cancelled: 'Booking Cancelled',
    };
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: managerId,
      type,
      title: titles[type],
      body: `${artistName} · ${venueName} — ${date}`,
      isRead: false,
      relatedId: bookingId,
      relatedType: 'booking',
      createdAt: new Date().toISOString(),
    });
  };

  const markRelatedNotificationsRead = (bookingId: string) => {
    allNotifications
      .filter((n) => n.userId === currentUser?.id && !n.isRead && n.relatedId === bookingId && n.relatedType === 'booking')
      .forEach((n) => markAsRead(n.id));
  };

  const pendingRequests = useMemo(() => {
    return rawBookings
      .filter((b) => b.artistId === currentUser?.id && !b.isArtistCreated && (
        b.status === 'requested' ||
        b.status === 'past_confirmation' ||
        (b.status === 'cancelled' && !b.cancellationAcknowledged && !b.cancelledByArtist)
      ))
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId) ?? (b.venueName ? { id: b.venueId, name: b.venueName, photoUrls: b.venuePhotoUrl ? [b.venuePhotoUrl] : [] } as any : undefined);
        const resolvedDate = slot?.date ?? b.slotDate;
        const resolvedStart = slot?.startTime ?? b.slotStartTime;
        const resolvedEnd = slot?.endTime ?? b.slotEndTime;
        const resolvedSlotName = slot?.name ?? b.slotName;
        const resolvedVenueName = venue?.name ?? b.venueName ?? 'Unknown Venue';
        const resolvedVenueType = venue?.venueType ?? '';
        return { ...b, slot, venue, resolvedDate, resolvedStart, resolvedEnd, resolvedSlotName, resolvedVenueName, resolvedVenueType };
      })
      .sort((a, b) => (a.resolvedDate ?? '') < (b.resolvedDate ?? '') ? -1 : 1);
  }, [rawBookings, currentUser?.id, slots, allVenues]);

  // ── Confirm a booking request ──
  const handleConfirm = (item: typeof pendingRequests[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation' ||
      (item.status === 'requested' && !!item.resolvedDate && new Date(item.resolvedDate + 'T00:00:00') <= new Date());
    Alert.alert(
      isPastConfirmation ? 'Confirm Completed Gig' : 'Confirm Booking',
      isPastConfirmation
        ? `Confirm that you played this gig at ${item.resolvedVenueName}?`
        : `Confirm your booking at ${item.resolvedVenueName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            const booking = rawBookings.find((x) => x.id === item.id);
            const now = new Date().toISOString();
            if (isPastConfirmation) {
              updateBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now, updatedAt: now, artistRespondedFromRequests: true });
              syncBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now });
            } else {
              updateBookingStatus(item.id, 'confirmed', { confirmedAt: now, artistRespondedFromRequests: true });
              syncBookingStatus(item.id, 'confirmed', { confirmedAt: now });
            }
            markRelatedNotificationsRead(item.id);
            if (booking) {
              notifyManager(item.managerId, 'booking_confirmed', item.id, item.resolvedVenueName, item.resolvedDate ? formatDate(item.resolvedDate) : '');
            }
          },
        },
      ]
    );
  };

  // ── Decline a booking request ──
  const handleDecline = (item: typeof pendingRequests[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation' ||
      (item.status === 'requested' && !!item.resolvedDate && new Date(item.resolvedDate + 'T00:00:00') <= new Date());
    Alert.alert(
      isPastConfirmation ? 'Decline Completed Gig' : 'Decline Booking',
      isPastConfirmation
        ? `Confirm that you did NOT play this gig at ${item.resolvedVenueName}?`
        : `Decline your booking at ${item.resolvedVenueName}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            const booking = rawBookings.find((x) => x.id === item.id);
            updateBookingStatus(item.id, 'declined', { updatedAt: new Date().toISOString(), artistRespondedFromRequests: true });
            hideFromCalendar(item.id);
            syncBookingStatus(item.id, 'declined', { hiddenFromCalendar: true });
            markRelatedNotificationsRead(item.id);
            if (booking) {
              notifyManager(item.managerId, 'booking_declined', item.id, item.resolvedVenueName, item.resolvedDate ? formatDate(item.resolvedDate) : '');
            }
          },
        },
      ]
    );
  };

  // ── Dismiss a manager cancellation ──
  const handleDismiss = (id: string) => {
    acknowledgeCancellation(id);
    syncBookingStatus(id, 'cancelled', { cancellationAcknowledged: true });
    markRelatedNotificationsRead(id);
  };

  const renderCard = ({ item }: { item: typeof pendingRequests[number] }) => {
    const isManagerCancelled = item.status === 'cancelled';
    const venuePhoto = item.venue ? venuePhotoUri(item.venue) : undefined;
    const dateLine = item.resolvedDate
      ? `${formatDate(item.resolvedDate)}${item.resolvedStart ? ` · ${formatTime(item.resolvedStart)}–${formatTime(item.resolvedEnd ?? '')}` : ''}`
      : '';
    const cancelledLine = item.resolvedDate ? `Cancelled by manager · ${formatDate(item.resolvedDate)}` : 'Cancelled by manager';

    return (
      <Pressable
        style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => router.push(('/(artist)/booking-detail?id=' + item.id) as Href)}
      >
        {/* Venue photo */}
        {venuePhoto ? (
          <Image source={{ uri: venuePhoto }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialIcons name="place" size={20} color={colors.muted} />
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
            {item.resolvedVenueName}
          </Text>
          {isManagerCancelled ? (
            <Text style={[styles.cancelledText, { color: colors.error }]} numberOfLines={1}>
              {cancelledLine}
            </Text>
          ) : (
            <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
              {dateLine}
            </Text>
          )}
        </View>

        {/* Right-side actions */}
        {isManagerCancelled ? (
          <Pressable
            style={({ pressed }) => [styles.dismissBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
            onPress={(e) => { e.stopPropagation?.(); handleDismiss(item.id); }}
            hitSlop={6}
          >
            <Text style={[styles.dismissBtnText, { color: colors.error }]}>Dismiss</Text>
          </Pressable>
        ) : (
          <View style={styles.respondRow}>
            {/* Decline */}
            <Pressable
              style={({ pressed }) => [styles.respondBtn, { backgroundColor: '#EF4444', opacity: pressed ? 0.85 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleDecline(item); }}
              hitSlop={6}
            >
              <MaterialIcons name="close" size={18} color="#fff" />
            </Pressable>
            {/* Confirm */}
            <Pressable
              style={({ pressed }) => [styles.respondBtn, { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleConfirm(item); }}
              hitSlop={6}
            >
              <MaterialIcons name="check" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

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
        <Text style={[styles.title, { color: colors.foreground }]}>Pending Requests</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={pendingRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="pending" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Pending Requests</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Booking requests from managers will appear here</Text>
          </View>
        }
        renderItem={renderCard}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingVertical: 8, flexGrow: 1 },

  // Flat IG row
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  photo: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1 },
  venueName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  time: { fontSize: 13 },
  cancelledText: { fontSize: 13, fontWeight: '600' },

  // Accept / Decline (match manager venue-join buttons)
  respondRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  respondBtn: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },

  // Dismiss (manager-cancelled)
  dismissBtn: { borderWidth: 1.5, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16 },
  dismissBtnText: { fontSize: 13, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
