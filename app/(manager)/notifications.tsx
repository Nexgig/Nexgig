import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { AppNotification } from '@/lib/types';

const NOTIF_ICONS: Record<string, string> = {
  booking_request: 'event',
  booking_confirmed: 'check-circle',
  booking_declined: 'cancel',
  booking_cancelled: 'event-busy',
  booking_completed: 'star',
  lineup_invite: 'person-add',
  invite_accepted: 'how-to-reg',
};

const NOTIF_COLORS: Record<string, string> = {
  booking_request: '#2563EB',
  booking_confirmed: '#22C55E',
  booking_declined: '#EF4444',
  booking_cancelled: '#8E8E93',
  booking_completed: '#8B5CF6',
  lineup_invite: '#F59E0B',
  invite_accepted: '#22C55E',
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

export default function ManagerNotificationsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const notifications = useMemo(
    () => allNotifications
      .filter((n) => n.userId === currentUser?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allNotifications, currentUser?.id]
  );
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  const handlePress = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.relatedType === 'booking' && notif.relatedId) {
      router.push(('/(manager)/booking-detail?id=' + notif.relatedId) as Href);
    }
  };

  const renderNotif = ({ item }: { item: AppNotification }) => {
    const icon = NOTIF_ICONS[item.type] ?? 'notifications';
    const iconColor = NOTIF_COLORS[item.type] ?? colors.primary;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.notifCard,
          { backgroundColor: item.isRead ? colors.surface : colors.primary + '08', borderColor: item.isRead ? colors.border : colors.primary + '30', opacity: pressed ? 0.85 : 1 }
        ]}
        onPress={() => handlePress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <MaterialIcons name={icon as any} size={22} color={iconColor} />
        </View>
        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, { color: colors.foreground, fontWeight: item.isRead ? '500' : '700' }]}>{item.title}</Text>
          <Text style={[styles.notifBody, { color: colors.muted }]} numberOfLines={2}>{item.body}</Text>
          <Text style={[styles.notifTime, { color: colors.muted }]}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={[styles.unreadDot, { backgroundColor:
            item.type === 'booking_confirmed' || item.type === 'lineup_accepted' || item.type === 'artist_joined' || item.type === 'lineup_added' ? '#22C55E' :
            item.type === 'booking_cancelled' || item.type === 'booking_declined' || item.type === 'booking_request_cancelled' || item.type === 'lineup_declined' || item.type === 'lineup_removed' ? '#EF4444' :
            colors.primary
          }]} />}
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
        {notifications.some((n) => !n.isRead) && (
          <Pressable onPress={() => markAllAsRead(currentUser?.id ?? '')}>
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotif}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
  list: { padding: 16, gap: 10, flexGrow: 1 },
  notifCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, marginBottom: 3 },
  notifBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
