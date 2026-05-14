import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, TouchableOpacity } from 'react-native';
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

export default function RequestsScreen() {
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

  const notifyManager = (type: 'booking_confirmed' | 'booking_declined' | 'booking_cancelled', booking: { id: string; managerId: string; resolvedVenueName?: string; resolvedDate?: string }) => {
    if (!currentUser) return;
    const titles = { booking_confirmed: 'Booking Confirmed', booking_declined: 'Booking Declined', booking_cancelled: 'Booking Cancelled' };
    const dateStr = booking.resolvedDate
      ? new Date(booking.resolvedDate + 'T00:00:00').toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' })
      : '';
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: booking.managerId,
      type,
      title: titles[type],
      body: `${currentUser.fullName} at ${booking.resolvedVenueName ?? 'a venue'} — ${dateStr}`,
      isRead: false,
      relatedId: booking.id,
      relatedType: 'booking',
      createdAt: new Date().toISOString(),
    });
  };

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

  const newRequests = useMemo(() =>
    bookingsWithDetails.filter(
      (b) =>
        b.status === 'requested' ||
        b.status === 'past_confirmation' ||
        (b.status === 'cancelled' && !b.cancellationAcknowledged && !b.cancelledByArtist)
    ),
    [bookingsWithDetails]
  );

  const responded = useMemo(() =>
    bookingsWithDetails.filter(
      (b) =>
        (b.status === 'confirmed' && b.artistRespondedFromRequests) ||
        (b.status === 'declined' && b.artistRespondedFromRequests) ||
        (b.status === 'completed' && b.artistRespondedFromRequests)
    ),
    [bookingsWithDetails]
  );

  const cancelled = useMemo(() =>
    bookingsWithDetails.filter(
      (b) => b.status === 'cancelled' && (b.cancellationAcknowledged || b.cancelledByArtist)
    ),
    [bookingsWithDetails]
  );

  const tabData: Record<Tab, typeof bookingsWithDetails> = { new: newRequests, responded, cancelled };

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
            const now = new Date().toISOString();
            if (isPastConfirmation) {
              updateBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now, updatedAt: now, artistRespondedFromRequests: true });
            } else {
              updateBookingStatus(item.id, 'confirmed', { confirmedAt: now, artistRespondedFromRequests: true });
            }
            markRelatedNotificationsRead(item.id);
            notifyManager('booking_confirmed', { id: item.id, managerId: item.managerId, resolvedVenueName: item.resolvedVenueName, resolvedDate: item.resolvedDate });
          },
        },
      ]
    );
  };

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
            updateBookingStatus(item.id, 'declined', { updatedAt: new Date().toISOString(), artistRespondedFromRequests: true });
            markRelatedNotificationsRead(item.id);
            notifyManager('booking_declined', { id: item.id, managerId: item.managerId, resolvedVenueName: item.resolvedVenueName, resolvedDate: item.resolvedDate });
          },
        },
      ]
    );
  };

  const handleDismiss = (id: string) => {
    acknowledgeCancellation(id);
    markRelatedNotificationsRead(id);
  };

  const renderCard = ({ item }: { item: typeof bookingsWithDetails[0] }) => {
    const isNew = activeTab === 'new';
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
        {isManagerCancelled && (
          <View style={[styles.cancelledBar, { backgroundColor: colors.error }]} />
        )}

        <View style={[styles.cardInner, isManagerCancelled && styles.cardInnerWithBar]}>
          {isManagerCancelled && isNew && (
            <View style={[styles.cancelBanner, { backgroundColor: colors.error + '18' }]}>
              <MaterialIcons name="cancel" size={13} color={colors.error} />
              <Text style={[styles.cancelBannerText, { color: colors.error }]}>Booking Cancelled by Manager</Text>
            </View>
          )}

          <View style={styles.cardHeader}>
            <Text
              style={[styles.venueName, { color: isResponded ? colors.muted : colors.foreground }]}
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

          {item.resolvedSlotName && (
            <View style={styles.slotRow}>
              <MaterialIcons name="label" size={14} color={colors.muted} />
              <Text style={[styles.slotText, { color: colors.muted }]}>{item.resolvedSlotName}</Text>
            </View>
          )}

          {isNew && !isManagerCancelled && (
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.declineBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
                onPress={(e) => { e.stopPropagation?.(); handleDecline(item); }}
              >
                <MaterialIcons name="close" size={18} color={colors.error} />
                <Text style={[styles.actionBtnText, { color: colors.error }]}>Decline</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.confirmBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
                onPress={(e) => { e.stopPropagation?.(); handleConfirm(item); }}
              >
                <MaterialIcons name="check" size={18} color="#000" />
                <Text style={[styles.actionBtnText, { color: '#000' }]}>Confirm</Text>
              </Pressable>
            </View>
          )}

          {isNew && isManagerCancelled && (
            <Pressable
              style={({ pressed }) => [styles.dismissBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleDismiss(item.id); }}
            >
              <Text style={[styles.dismissBtnText, { color: colors.error }]}>Dismiss</Text>
            </Pressable>
          )}

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
      {/* Header with back button */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <MaterialIcons name="arrow-back-ios" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Requests</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '800' },
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

  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cancelledCard: { borderLeftWidth: 0 },
  cancelledBar: { width: 4, position: 'absolute', top: 0, bottom: 0, left: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  cardInner: { padding: 16, gap: 8 },
  cardInnerWithBar: { paddingLeft: 20 },

  cancelBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  cancelBannerText: { fontSize: 12, fontWeight: '700' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  venueName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotText: { fontSize: 13 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  venueType: { fontSize: 12 },

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

  dismissBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  dismissBtnText: { fontSize: 14, fontWeight: '700' },

  completedGigBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  completedGigBadgeText: { fontSize: 11, fontWeight: '700' },
});
