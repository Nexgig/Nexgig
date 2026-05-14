import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

type Tab = 'new' | 'responded' | 'cancelled';

export default function DJBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const rawBookings = useBookingStore((s) => s.bookings);
  const allBookings = rawBookings;
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const acknowledgeCancellation = useBookingStore((s) => s.acknowledgeCancellation);
  const slots = useSlotStore((s) => s.slots);
  const venues = useVenueStore((s) => s.venues);
  const [activeTab, setActiveTab] = useState<Tab>('new');
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
      .forEach((n) => markAsRead(n.id));
  };

  const bookingsWithDetails = useMemo(() =>
    rawBookings
      .filter((b) => b.artistId === currentUser?.id && !b.isArtistCreated)
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const venue = venues.find((v) => v.id === b.venueId);
        const resolvedDate = slot?.date ?? b.slotDate;
        const resolvedStart = slot?.startTime ?? b.slotStartTime;
        const resolvedEnd = slot?.endTime ?? b.slotEndTime;
        const resolvedSlotName = slot?.name ?? b.slotName;
        const resolvedVenueName = venue?.name ?? b.venueName ?? 'Unknown Venue';
        const resolvedVenueType = venue?.venueType ?? '';
        return { ...b, slot, venue, resolvedDate, resolvedStart, resolvedEnd, resolvedSlotName, resolvedVenueName, resolvedVenueType };
      }),
    [rawBookings, slots, venues, currentUser?.id]
  );

  // New: requested bookings + manager-cancelled bookings not yet acknowledged by artist
  const newRequests = useMemo(() =>
    bookingsWithDetails.filter(
      (b) =>
        b.status === 'requested' ||
        b.status === 'past_confirmation' ||
        (b.status === 'cancelled' && !b.cancellationAcknowledged && !b.cancelledByArtist)
    ),
    [bookingsWithDetails]
  );

  // Responded: bookings the artist actively responded to from this Requests tab
  // - regular bookings: confirmed or declined (always from Requests)
  // - past_confirmation: only if artist explicitly responded (artistRespondedFromRequests flag)
  const responded = useMemo(() =>
    bookingsWithDetails.filter(
      (b) =>
        (b.status === 'confirmed' && b.artistRespondedFromRequests) ||
        (b.status === 'declined' && b.artistRespondedFromRequests) ||
        (b.status === 'completed' && b.artistRespondedFromRequests)
    ),
    [bookingsWithDetails]
  );

  // Cancelled: manager-cancelled bookings that the artist has acknowledged (dismissed)
  const cancelled = useMemo(() =>
    bookingsWithDetails.filter(
      (b) => b.status === 'cancelled' && (b.cancellationAcknowledged || b.cancelledByArtist)
    ),
    [bookingsWithDetails]
  );

  const tabData: Record<Tab, typeof bookingsWithDetails> = { new: newRequests, responded, cancelled };

  // ── Confirm a booking request ──
  const handleConfirm = (item: typeof bookingsWithDetails[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation';
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
            const booking = allBookings.find((x) => x.id === item.id);
            const now = new Date().toISOString();
            if (isPastConfirmation) {
              updateBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now, updatedAt: now, artistRespondedFromRequests: true });
            } else {
              updateBookingStatus(item.id, 'confirmed', { confirmedAt: now, artistRespondedFromRequests: true });
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
  const handleDecline = (item: typeof bookingsWithDetails[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation';
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
            const booking = allBookings.find((x) => x.id === item.id);
            updateBookingStatus(item.id, 'declined', { updatedAt: new Date().toISOString(), artistRespondedFromRequests: true });
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
    markRelatedNotificationsRead(id);
  };

  const renderCard = ({ item }: { item: typeof bookingsWithDetails[0] }) => {
    const isNew = activeTab === 'new';
    const isCancelled = activeTab === 'cancelled' || item.status === 'cancelled';
    const isResponded = activeTab === 'responded';
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
          {isManagerCancelled && isNew && (
            <View style={[styles.cancelBanner, { backgroundColor: colors.error + '18' }]}>
              <MaterialIcons name="cancel" size={13} color={colors.error} />
              <Text style={[styles.cancelBannerText, { color: colors.error }]}>Booking Cancelled by Manager</Text>
            </View>
          )}

          {/* Header row */}
          <View style={styles.cardHeader}>
            <Text
              style={[
                styles.venueName,
                { color: isResponded ? colors.muted : colors.foreground },
              ]}
              numberOfLines={1}
            >
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
                {item.resolvedStart
                  ? ` · ${formatTime(item.resolvedStart)}–${formatTime(item.resolvedEnd ?? '')}`
                  : ''}
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

          {/* Action buttons — New tab, requested or past_confirmation status */}
          {isNew && !isManagerCancelled && (
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

          {/* Dismiss button — New tab, manager-cancelled bookings */}
          {isNew && isManagerCancelled && (
            <Pressable
              style={({ pressed }) => [styles.dismissBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleDismiss(item.id); }}
            >
              <Text style={[styles.dismissBtnText, { color: colors.error }]}>Dismiss</Text>
            </Pressable>
          )}

          {/* Responded / Cancelled tab: chevron to open detail */}
          {!isNew && (
            <View style={styles.cardFooter}>
              <Text style={[styles.venueType, { color: colors.muted }]}>{item.resolvedVenueType}</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'responded', label: 'Responded' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const newCount = newRequests.length;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Requests</Text>
      </View>

      {/* Inner underline tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.muted }]}>
                {tab.label}
              </Text>
              {/* Badge only on New tab */}
              {tab.key === 'new' && newCount > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: isActive ? colors.primary : colors.border }]}>
                  <Text style={[styles.tabBadgeText, { color: isActive ? '#fff' : colors.muted }]}>
                    {newCount}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        data={tabData[activeTab]}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={activeTab === 'cancelled' ? 'cancel' : activeTab === 'responded' ? 'check-circle' : 'inbox'}
            title={
              activeTab === 'new'
                ? 'No new requests'
                : activeTab === 'responded'
                ? 'No responded bookings'
                : 'No cancelled bookings'
            }
            subtitle={
              activeTab === 'new'
                ? 'New gig requests from managers will appear here'
                : activeTab === 'responded'
                ? 'Bookings you confirmed or declined will appear here'
                : ''
            }
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '800' },
  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, paddingHorizontal: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tabBadgeText: { fontSize: 11, fontWeight: '700' },
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
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  venueType: { fontSize: 12 },

  // Action buttons — identical sizing/shape to calendar card inline buttons
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
});
