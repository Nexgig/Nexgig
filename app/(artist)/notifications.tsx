import { isForRole } from '@/lib/notification-roles';
import { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, RefreshControl, Animated } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useNotificationStore, useBookingStore, loadNotificationsFromSupabase } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import type { AppNotification } from '@/lib/types';

const NOTIF_ICONS: Record<string, string> = {
  booking_request: 'event',
  booking_confirmed: 'check-circle',
  booking_declined: 'cancel',
  booking_cancelled: 'event-busy',
  booking_request_cancelled: 'event-busy',
  booking_completed: 'star',
  past_confirmation_request: 'history',
  lineup_invite: 'person-add',
  lineup_accepted: 'how-to-reg',
  lineup_declined: 'person-remove',
  artist_joined: 'how-to-reg',
  lineup_added: 'group-add',
  lineup_removed: 'group-remove',
  venue_assigned: 'place',
  venue_removed: 'location-off',
  manager_invite: 'person-add',
};

const NOTIF_COLORS: Record<string, string> = {
  booking_request: '#22C55E',
  booking_confirmed: '#22C55E',
  booking_declined: '#EF4444',
  booking_cancelled: '#94A3B8',
  booking_request_cancelled: '#94A3B8',
  booking_completed: '#8B5CF6',
  past_confirmation_request: '#3B82F6',
  lineup_invite: '#D4A017',
  lineup_accepted: '#22C55E',
  lineup_declined: '#EF4444',
  artist_joined: '#22C55E',
  lineup_added: '#10B981',
  lineup_removed: '#EF4444',
  venue_assigned: '#8B5CF6',
  venue_removed: '#EF4444',
  manager_invite: '#D4A017',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ArtistNotificationsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  // Subscribe to the raw array — stable reference, no infinite loop
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const [refreshing, setRefreshing] = useState(false);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // On open: refetch, then auto-dismiss unread — mark read and fade the highlight out
  // over ~3s. They stay as history.
  // EXCEPT a gig request, which stays UNREAD until the artist actually responds — it's
  // a to-do, not
  // an FYI, so it must not fade away just because they opened the screen. Once the
  // booking leaves requested/past_confirmation, it fades like any other notification.
  const needsAction = useCallback((n: { type: string; relatedId?: string }) => {
    if (n.type !== 'booking_request' && n.type !== 'past_confirmation_request') return false;
    const b = useBookingStore.getState().bookings.find((x) => x.id === n.relatedId);
    return !b || b.status === 'requested' || b.status === 'past_confirmation';
  }, []);

  useFocusEffect(useCallback(() => {
    if (!currentUser?.id) return;
    loadNotificationsFromSupabase(currentUser.id);
    const unread = new Set(
      useNotificationStore.getState().notifications
        .filter((n) => n.userId === currentUser.id && !n.isRead && isForRole(n.type, 'artist') && !needsAction(n))
        .map((n) => n.id)
    );
    if (unread.size === 0) return;
    setFadingIds(unread);
    unread.forEach((id) => markAsRead(id));
    fadeAnim.setValue(1);
    // JS driver (not native): this fade shares one Animated.Value across recycling
    // FlatList rows, and cycles on every focus/blur. The native animated driver throws
    // an NSException (SIGABRT) when a node/view is dropped mid-animation under that churn.
    const anim = Animated.timing(fadeAnim, { toValue: 0, duration: 3000, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) setFadingIds(new Set()); });
    return () => anim.stop();
  }, [currentUser?.id]));

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    await loadNotificationsFromSupabase(currentUser.id);
    setRefreshing(false);
  }, [currentUser?.id]);

  // Derive the filtered + sorted list with useMemo so the reference is stable
  const notifications = useMemo(
    () =>
      allNotifications
        .filter((n) => n.userId === currentUser?.id && isForRole(n.type, 'artist'))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allNotifications, currentUser?.id]
  );

  const handlePress = (notif: AppNotification) => {
    // Opening a pending gig request must NOT clear it — only responding does.
    if (!needsAction(notif)) markAsRead(notif.id);
    // All booking-related notifications open the booking detail screen
    if (
      notif.relatedType === 'booking' &&
      notif.relatedId &&
      (
        notif.type === 'booking_request' ||
        notif.type === 'booking_cancelled' ||
        notif.type === 'booking_request_cancelled' ||
        notif.type === 'past_confirmation_request'
      )
    ) {
      router.push(('/(artist)/booking-detail?id=' + notif.relatedId + '&from=notifications') as Href);
    } else if (
      notif.type === 'lineup_added' ||
      notif.type === 'lineup_removed' ||
      notif.type === 'venue_removed'
    ) {
      router.push('/(artist)/my-venues' as Href);
    } else if (notif.type === 'venue_assigned') {
      const venueParam = notif.relatedId ? `?highlightVenueId=${notif.relatedId}` : '';
      router.push(('/(artist)/my-venues' + venueParam) as Href);
    }
  };

  const renderNotif = ({ item }: { item: AppNotification }) => {
    const icon = NOTIF_ICONS[item.type] ?? 'notifications';
    const iconColor = NOTIF_COLORS[item.type] ?? colors.primary;
    const isFading = fadingIds.has(item.id);
    const showUnread = isFading || !item.isRead;
    const dotColor =
      item.type === 'booking_request' || item.type === 'booking_confirmed' || item.type === 'lineup_accepted' || item.type === 'artist_joined' || item.type === 'lineup_added' || item.type === 'venue_assigned' ? '#22C55E' :
      item.type === 'booking_cancelled' || item.type === 'booking_declined' || item.type === 'booking_request_cancelled' || item.type === 'lineup_declined' || item.type === 'lineup_removed' || item.type === 'venue_removed' ? '#EF4444' :
      colors.primary;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.notifCard,
          { backgroundColor: item.isRead ? 'transparent' : colors.primary + '08', opacity: pressed ? 0.6 : 1 }
        ]}
        onPress={() => handlePress(item)}
      >
        {isFading && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.primary + '08', opacity: fadeAnim }]}
          />
        )}
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <MaterialIcons name={icon as any} size={22} color={iconColor} />
        </View>
        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, {
            color: item.type === 'booking_request_cancelled' ? colors.error : colors.foreground,
            fontWeight: showUnread ? '700' : '500'
          }]}>{item.title}</Text>
          <Text style={[styles.notifBody, { color: colors.muted }]} numberOfLines={2}>{item.body}</Text>
          <Text style={[styles.notifTime, { color: colors.muted }]}>{timeAgo(item.createdAt)}</Text>
        </View>
        {isFading
          ? <Animated.View style={[styles.unreadDot, { backgroundColor: dotColor, opacity: fadeAnim }]} />
          : (!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: dotColor }]} /> : null)}
      </Pressable>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
      </View>

      <FlatList
        data={notifications}
        extraData={fadingIds}
        keyExtractor={(item) => item.id}
        renderItem={renderNotif}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <Divider full />}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState icon="notifications" title="No notifications" subtitle="You're all caught up!" />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 20, fontWeight: '800' },
  markAllText: { fontSize: 13, fontWeight: '600' },
  list: { paddingVertical: 8, flexGrow: 1 },
  notifCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, marginBottom: 3 },
  notifBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
