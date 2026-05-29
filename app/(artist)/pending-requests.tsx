import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useNotificationStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function ArtistPendingRequestsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const rawBookings = useBookingStore((s) => s.bookings);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
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
      body: `${artistName} at ${venueName} — ${date}`,
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
        const venue = allVenues.find((v) => v.id === b.venueId);
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
            syncBookingStatus(item.id, 'declined', {});
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

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: isManagerCancelled ? colors.error : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
          isManagerCancelled && styles.cancelledCard,
        ]}
        onPress={() => router.push(('/(artist)/booking-detail?id=' + item.id) as Href)}
      >
        {/* Red left border for cancelled */}
        {isManagerCancelled && (
          <View style={[styles.cancelledBar, { backgroundColor: colors.error }]} />
        )}

        <View style={[styles.cardInner, isManagerCancelled && styles.cardInnerWithBar]}>
          {/* Cancellation notice banner */}
          {isManagerCancelled && (
            <View style={[styles.cancelBanner, { backgroundColor: colors.error + '18' }]}>
              <MaterialIcons name="cancel" size={13} color={colors.error} />
              <Text style={[styles.cancelBannerText, { color: colors.error }]}>Booking Cancelled by Manager</Text>
            </View>
          )}

          {/* Header row */}
          <View style={styles.cardHeader}>
            <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
              {item.resolvedVenueName}
            </Text>
            {item.status === 'past_confirmation' ? (
              <View style={[styles.completedGigBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
                <Text style={[styles.completedGigBadgeText, { color: colors.primary }]}>Completed Gig</Text>
              </View>
            ) : (
              <StatusBadge status={item.status} />
            )}
          </View>

          {/* Date / time */}
          {item.resolvedDate && (
            <View style={styles.slotRow}>
              <MaterialIcons name="event" size={14} color={colors.muted} />
              <Text style={[styles.slotText, { color: colors.muted }]}>
                {formatDate(item.resolvedDate)}
                {item.resolvedStart ? ` · ${formatTime(item.resolvedStart)}–${formatTime(item.resolvedEnd ?? '')}` : ''}
              </Text>
            </View>
          )}

          {/* Slot name */}
          {item.resolvedSlotName && (
            <View style={styles.slotRow}>
              <MaterialIcons name="label" size={14} color={colors.muted} />
              <Text style={[styles.slotText, { color: colors.muted }]}>{item.resolvedSlotName}</Text>
            </View>
          )}

          {/* Accept / Decline action buttons */}
          {!isManagerCancelled && (
            <View style={styles.actionRow}>
              {/* Decline */}
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.declineBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
                onPress={(e) => { e.stopPropagation?.(); handleDecline(item); }}
              >
                <MaterialIcons name="close" size={18} color={colors.error} />
                <Text style={[styles.actionBtnText, { color: colors.error }]}>Decline</Text>
              </Pressable>

              {/* Confirm */}
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.confirmBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
                onPress={(e) => { e.stopPropagation?.(); handleConfirm(item); }}
              >
                <MaterialIcons name="check" size={18} color="#000" />
                <Text style={[styles.actionBtnText, { color: '#000' }]}>Confirm</Text>
              </Pressable>
            </View>
          )}

          {/* Dismiss button — manager-cancelled bookings */}
          {isManagerCancelled && (
            <Pressable
              style={({ pressed }) => [styles.dismissBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleDismiss(item.id); }}
            >
              <Text style={[styles.dismissBtnText, { color: colors.error }]}>Dismiss</Text>
            </Pressable>
          )}
        </View>
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
  list: { padding: 16, gap: 12, flexGrow: 1 },

  // Card base
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cancelledCard: { borderLeftWidth: 0 },
  cancelledBar: { width: 4, position: 'absolute', top: 0, bottom: 0, left: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  cardInner: { padding: 16, gap: 8 },
  cardInnerWithBar: { paddingLeft: 20 },

  // Cancellation banner
  cancelBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  cancelBannerText: { fontSize: 12, fontWeight: '700' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  venueName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotText: { fontSize: 13 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  declineBtn: { borderWidth: 1.5 },
  confirmBtn: {},
  actionBtnText: { fontSize: 14, fontWeight: '700' },

  // Dismiss button
  dismissBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  dismissBtnText: { fontSize: 14, fontWeight: '700' },

  // Completed Gig badge
  completedGigBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  completedGigBadgeText: { fontSize: 11, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
