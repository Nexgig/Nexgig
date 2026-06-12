import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Modal, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '@/components/ui/avatar-image';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useVenueStore, useLineupStore, useBookingStore, useNotificationStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import type { VenueAssignment } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

export default function RosterScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const removeFromGlobalLineup = useLineupStore((s) => s.removeFromGlobalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);
  const bookings = useBookingStore((s) => s.bookings);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [showAssignSheet, setShowAssignSheet] = useState(false);
  const [assignDJId, setAssignDJId] = useState('');

  const myGlobalLineup = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active'),
    [globalLineup, currentUser?.id]
  );

  const activeAssignments = useMemo(
    () => venueAssignments.filter((a) => a.status === 'active'),
    [venueAssignments]
  );

  const djListGlobal = useMemo(() => {
    return myGlobalLineup.map((entry) => {
      const user = getArtistUser(entry.artistId);
      const profile = getArtistProfile(entry.artistId);
      const assignedVenueIds = activeAssignments
        .filter((a) => a.artistId === entry.artistId)
        .map((a) => a.venueId);
      const assignedVenues = venues.filter((v) => assignedVenueIds.includes(v.id));
      return { entry, user, profile, assignedVenues, assignedVenueIds };
    }).filter((item) => item.user)
      .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));
  }, [myGlobalLineup, activeAssignments, venues, getArtistUser, getArtistProfile]);

  const getCompletedGigs = (artistId: string) =>
    bookings.filter((b) => b.artistId === artistId && b.isCompleted).length;

  const handleRemoveDJ = (artistId: string, djName: string) => {
    if (getCompletedGigs(artistId) > 0) {
      Alert.alert('Cannot Remove', 'Cannot remove — this artist has completed gigs.');
      return;
    }
    Alert.alert('Remove from Lineup', `Remove ${djName} from your lineup? This will also remove them from all venues.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        removeFromGlobalLineup(artistId);
        // Persist to Supabase: delete the global lineup row + all this manager's venue
        // assignments for the artist (local store alone reverts on the next re-sync).
        if (currentUser?.id) {
          const { error: glErr } = await supabase.from('global_lineup').delete().eq('manager_id', currentUser.id).eq('artist_id', artistId);
          if (glErr) console.warn('Failed to remove global_lineup row:', glErr.message);
          const { error: vaErr } = await supabase.from('venue_assignments').delete().eq('manager_id', currentUser.id).eq('artist_id', artistId);
          if (vaErr) console.warn('Failed to remove venue_assignments rows:', vaErr.message);
        }
        addNotification({
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          userId: artistId, type: 'lineup_removed', title: 'Removed from Lineup',
          body: `${currentUser?.fullName ?? 'A manager'} removed you from their artist lineup.`,
          isRead: false, createdAt: new Date().toISOString(),
        });
      }},
    ]);
  };

  const openAssignSheet = (artistId: string) => { setAssignDJId(artistId); setShowAssignSheet(true); };

  const handleAddToVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert('Add to Venue', `Add ${djName} to ${venueName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: () => {
        const grEntry = myGlobalLineup.find((r) => r.artistId === assignDJId);
        const newAssignment: VenueAssignment = {
          id: `va-${Date.now()}`, globalLineupId: grEntry?.id ?? '',
          venueId, artistId: assignDJId, assignedAt: new Date().toISOString(), status: 'active',
        };
        assignToVenue(newAssignment);
        addNotification({
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          userId: assignDJId, type: 'venue_assigned', title: 'Assigned to Venue',
          body: `${currentUser?.fullName ?? 'A manager'} assigned you to ${venueName}.`,
          isRead: false, relatedId: venueId, relatedType: 'venue', createdAt: new Date().toISOString(),
        });
      }},
    ]);
  };

  const handleRemoveFromVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert('Remove from Venue', `Remove ${djName} from ${venueName}? They will stay on your global lineup.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        removeFromVenue(venueId, assignDJId);
        // Persist to Supabase: delete this specific venue assignment row.
        if (currentUser?.id && assignDJId) {
          const { error } = await supabase.from('venue_assignments').delete().eq('manager_id', currentUser.id).eq('artist_id', assignDJId).eq('venue_id', venueId);
          if (error) console.warn('Failed to remove venue_assignment:', error.message);
        }
        addNotification({
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          userId: assignDJId, type: 'venue_removed', title: 'Removed from Venue',
          body: `${currentUser?.fullName ?? 'A manager'} removed you from ${venueName}.`,
          isRead: false, createdAt: new Date().toISOString(),
        });
      }},
    ]);
  };

  const assignDJName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
  const assignArtistProfile = getArtistProfile(assignDJId);
  const assignDJUser = getArtistUser(assignDJId);
  const assignedVenueIdsForDJ = useMemo(
    () => activeAssignments.filter((a) => a.artistId === assignDJId).map((a) => a.venueId),
    [activeAssignments, assignDJId]
  );
  const unassignedVenues = useMemo(
    () => venues.filter((v) => !assignedVenueIdsForDJ.includes(v.id)),
    [venues, assignedVenueIdsForDJ]
  );
  const assignedVenues = useMemo(
    () => venues.filter((v) => assignedVenueIdsForDJ.includes(v.id)),
    [venues, assignedVenueIdsForDJ]
  );

  const renderArtist = ({ item }: { item: typeof djListGlobal[0] }) => {
    if (!item.user) return null;
    const completedGigs = getCompletedGigs(item.user.id);
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <AvatarImage uri={item.user.profilePhotoUrl} name={item.user.fullName} size={52} />
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.user.fullName}</Text>
            <Text style={[styles.cardGenre, { color: colors.muted }]} numberOfLines={1}>{item.profile?.primaryGenre ?? 'Artist'}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <MaterialIcons name="check-circle" size={11} color={colors.success} />
                <Text style={[styles.statText, { color: colors.muted }]}>{completedGigs} gig{completedGigs !== 1 ? 's' : ''}</Text>
              </View>
              {item.assignedVenues.length > 0 && (
                <>
                  <View style={[styles.statDot, { backgroundColor: colors.border }]} />
                  <View style={styles.statChip}>
                    <MaterialIcons name="location-on" size={11} color={colors.primary} />
                    <Text style={[styles.statText, { color: colors.primary }]}>{item.assignedVenues.length} venue{item.assignedVenues.length > 1 ? 's' : ''}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? colors.background : 'transparent' }]}
            onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + item.user!.id) as Href)}
          >
            <MaterialIcons name="person" size={15} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Profile</Text>
          </Pressable>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? colors.background : 'transparent' }]}
            onPress={() => openAssignSheet(item.user!.id)}
          >
            <MaterialIcons name="add-business" size={15} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Assign Venue</Text>
          </Pressable>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: pressed ? colors.background : 'transparent' }]}
            onPress={() => handleRemoveDJ(item.user!.id, item.user!.fullName ?? 'Artist')}
          >
            <MaterialIcons name="person-remove" size={15} color={colors.error} />
            <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Artists</Text>
      </View>

      <FlatList
        data={djListGlobal}
        keyExtractor={(item) => item.entry.id}
        renderItem={renderArtist}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 8) + 56 + 24 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="group"
            title="No artists on your lineup"
            subtitle="Invite artists from their profile in the Network tab."
          />
        }
      />

      {/* Assign Venue Sheet */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetArtistRow}>
              <AvatarImage uri={assignDJUser?.profilePhotoUrl} name={assignDJUser?.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>{assignDJName}</Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]} numberOfLines={1}>{assignArtistProfile?.primaryGenre ?? 'Artist'}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} style={styles.venueScrollList} showsVerticalScrollIndicator={false}>
              {unassignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>ADD TO VENUE</Text>
                  {unassignedVenues.map((v) => (
                    <Pressable
                      key={v.id}
                      style={({ pressed }) => [styles.venueRow, { backgroundColor: pressed ? colors.surface : colors.background, borderColor: colors.border }]}
                      onPress={() => handleAddToVenue(v.id)}
                    >
                      <View style={[styles.venueRowIcon, { backgroundColor: colors.border + '60' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.muted} />
                      </View>
                      <View style={styles.venueRowInfo}>
                        <Text style={[styles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[styles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
                    </Pressable>
                  ))}
                </>
              )}
              {assignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: unassignedVenues.length > 0 ? 16 : 0 }]}>ASSIGNED</Text>
                  {assignedVenues.map((v) => (
                    <View key={v.id} style={[styles.venueRow, { backgroundColor: colors.primary + '0A', borderColor: colors.primary + '40' }]}>
                      <View style={[styles.venueRowIcon, { backgroundColor: colors.primary + '15' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.venueRowInfo}>
                        <Text style={[styles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[styles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [styles.removeVenueBtn, { backgroundColor: colors.error + '15', opacity: pressed ? 0.6 : 1 }]}
                        onPress={() => handleRemoveFromVenue(v.id)}
                      >
                        <MaterialIcons name="remove-circle" size={16} color={colors.error} />
                        <Text style={[styles.removeVenueBtnText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              {venues.length === 0 && (
                <Text style={[styles.emptyVenues, { color: colors.muted }]}>No venues yet. Add a venue first.</Text>
              )}
            </ScrollView>
            <Pressable
              style={[styles.doneBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowAssignSheet(false)}
            >
              <Text style={[styles.doneBtnText, { color: colors.foreground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  cardGenre: { fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, fontWeight: '500' },
  statDot: { width: 3, height: 3, borderRadius: 2 },
  actionRow: { flexDirection: 'row', borderTopWidth: 0.5 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  actionDivider: { width: 0.5, marginVertical: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetArtistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  venueScrollList: { flexGrow: 0, maxHeight: 380 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  venueRowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  venueRowInfo: { flex: 1 },
  venueRowName: { fontSize: 15, fontWeight: '700' },
  venueRowType: { fontSize: 12, marginTop: 1 },
  removeVenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  removeVenueBtnText: { fontSize: 12, fontWeight: '600' },
  emptyVenues: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 44 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },
});
