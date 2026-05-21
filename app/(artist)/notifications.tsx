import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useNotificationStore, useLineupStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
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
  booking_request: '#2E75B6',
  booking_confirmed: '#22C55E',
  booking_declined: '#EF4444',
  booking_cancelled: '#94A3B8',
  booking_request_cancelled: '#94A3B8',
  booking_completed: '#8B5CF6',
  past_confirmation_request: '#3B82F6',
  lineup_invite: '#F59E0B',
  lineup_accepted: '#22C55E',
  lineup_declined: '#EF4444',
  artist_joined: '#22C55E',
  lineup_added: '#10B981',
  lineup_removed: '#EF4444',
  venue_assigned: '#8B5CF6',
  venue_removed: '#EF4444',
  manager_invite: '#F59E0B',
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
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const addToGlobalLineup = useLineupStore((s) => s.addToGlobalLineup);
  const addArtistUser = useLineupStore((s) => s.addArtistUser);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const addVenue = useVenueStore((s) => s.addVenue);
  const allVenues = useVenueStore((s) => s.venues);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAcceptInvite = async (notif: AppNotification) => {
    if (!currentUser || !notif.relatedId) return;
    setProcessingId(notif.id);
    // Fetch invite details
    const { data: invite, error } = await supabase
      .from('invites')
      .select('*')
      .eq('id', notif.relatedId)
      .single();
    if (error || !invite) {
      setProcessingId(null);
      Alert.alert('Error', 'Invite not found.');
      return;
    }
    // Add to global lineup
    await supabase.from('global_lineup').upsert(
      { manager_id: invite.manager_id, artist_id: currentUser.id, status: 'active' },
      { onConflict: 'manager_id,artist_id' }
    );
    // Assign to selected venues
    if (invite.venue_ids && invite.venue_ids.length > 0) {
      const assignments = invite.venue_ids.map((venueId: string) => ({
        manager_id: invite.manager_id, artist_id: currentUser.id,
        venue_id: venueId, status: 'active',
      }));
      await supabase.from('venue_assignments').upsert(assignments, { onConflict: 'venue_id,artist_id' });
    }
    // Update invite status
    await supabase.from('invites').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', invite.id);
    // Update local store
    addArtistUser({
      id: currentUser.id, email: currentUser.email ?? '', phone: currentUser.phone ?? '',
      accountType: 'artist' as const, fullName: currentUser.fullName ?? '',
      isPhoneVerified: false, isEmailVerified: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    addToGlobalLineup({
      id: `${invite.manager_id}-${currentUser.id}`,
      managerId: invite.manager_id, artistId: currentUser.id,
      status: 'active' as const, addedAt: new Date().toISOString(),
    });
    // Add venue assignments — fetch ALL manager venues and assign
    const { data: managerVenues } = await supabase
      .from('venues')
      .select('id, manager_id, name, venue_type, photo_urls, genre_preferences, energy_preferences, google_maps_location, is_hidden, created_at, updated_at')
      .eq('manager_id', invite.manager_id)
      .neq('is_hidden', true);

    if (managerVenues && managerVenues.length > 0) {
      const assignments = managerVenues.map((v: any) => ({
        manager_id: invite.manager_id, artist_id: currentUser.id,
        venue_id: v.id, status: 'active',
      }));
      await supabase.from('venue_assignments').upsert(assignments, { onConflict: 'venue_id,artist_id' });

      // Add venues to local store if missing
      managerVenues.forEach((v: any) => {
        if (!allVenues.some((existing) => existing.id === v.id)) {
          addVenue({
            id: v.id, managerId: v.manager_id, name: v.name,
            venueType: v.venue_type, description: v.description,
            photoUrls: v.photo_urls ?? [],
            genrePreferences: v.genre_preferences ?? [],
            energyPreferences: v.energy_preferences ?? [],
            googleMapsLocation: v.google_maps_location,
            isHidden: v.is_hidden ?? false,
            createdAt: v.created_at, updatedAt: v.updated_at,
          });
        }
      });

      managerVenues.forEach((v: any, idx: number) => {
        assignToVenue({
          id: `va-${invite.id}-${idx}`,
          globalLineupId: `${invite.manager_id}-${currentUser.id}`,
          venueId: v.id, artistId: currentUser.id,
          assignedAt: new Date().toISOString(),
          status: 'active' as const,
        });
      });
    }
    markAsRead(notif.id);
    removeNotification(notif.id);
    setProcessingId(null);
    Alert.alert('Accepted!', 'You have joined their lineup.');
  };

  const handleDeclineInvite = async (notif: AppNotification) => {
    if (!notif.relatedId) return;
    setProcessingId(notif.id);
    await supabase.from('invites').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', notif.relatedId);
    markAsRead(notif.id);
    removeNotification(notif.id);
    setProcessingId(null);
  };

  // Derive the filtered + sorted list with useMemo so the reference is stable
  const notifications = useMemo(
    () =>
      allNotifications
        .filter((n) => n.userId === currentUser?.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allNotifications, currentUser?.id]
  );

  const handlePress = (notif: AppNotification) => {
    markAsRead(notif.id);
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
    const isInvite = item.type === 'manager_invite';
    const isProcessing = processingId === item.id;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.notifCard,
          { backgroundColor: item.isRead ? colors.surface : colors.primary + '08', borderColor: item.isRead ? colors.border : colors.primary + '30', opacity: pressed && !isInvite ? 0.85 : 1 }
        ]}
        onPress={() => !isInvite && handlePress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <MaterialIcons name={icon as any} size={22} color={iconColor} />
        </View>
        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, {
            color: item.type === 'booking_request_cancelled' ? colors.error : colors.foreground,
            fontWeight: item.isRead ? '500' : '700'
          }]}>{item.title}</Text>
          <Text style={[styles.notifBody, { color: colors.muted }]} numberOfLines={2}>{item.body}</Text>
          <Text style={[styles.notifTime, { color: colors.muted }]}>{timeAgo(item.createdAt)}</Text>
          {isInvite && (
            <View style={styles.inviteActions}>
              <Pressable
                style={[styles.acceptBtn, { backgroundColor: colors.success }]}
                onPress={() => handleAcceptInvite(item)}
                disabled={isProcessing}
              >
                {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionBtnText}>Accept</Text>}
              </Pressable>
              <Pressable
                style={[styles.declineBtn, { borderColor: colors.border }]}
                onPress={() => handleDeclineInvite(item)}
                disabled={isProcessing}
              >
                <Text style={[styles.actionBtnText, { color: colors.muted }]}>Decline</Text>
              </Pressable>
            </View>
          )}
        </View>
        {!item.isRead && !isInvite && <View style={[styles.unreadDot, { backgroundColor:
            item.type === 'booking_confirmed' || item.type === 'lineup_accepted' || item.type === 'artist_joined' || item.type === 'lineup_added' || item.type === 'venue_assigned' ? '#22C55E' :
            item.type === 'booking_cancelled' || item.type === 'booking_declined' || item.type === 'booking_request_cancelled' || item.type === 'lineup_declined' || item.type === 'lineup_removed' || item.type === 'venue_removed' ? '#EF4444' :
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
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  declineBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
