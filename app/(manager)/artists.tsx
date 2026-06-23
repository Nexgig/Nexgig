import { useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, Modal,
  TextInput, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

  // ── Invite modal ────────────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // ── Assign Venue sheet ──────────────────────────────────────────────────────
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
    bookings.filter((b) => b.artistId === artistId && b.managerId === currentUser?.id && b.isCompleted).length;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleDisconnect = (artistId: string, djName: string) => {
    Alert.alert(
      'Disconnect Artist',
      `Disconnect ${djName}? They'll be removed from your lineup and all your venues. Past gig history stays.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: async () => {
          // Local store — also cascades venue assignments for this artist
          removeFromGlobalLineup(artistId);
          // Supabase — deactivate this manager's lineup + venue assignments so it survives reload
          if (currentUser?.id) {
            // DELETE the rows (do NOT update status='removed' — that violates a check
            // constraint on venue_assignments and fails silently, so the artist returns
            // on the next re-sync / sign-in).
            const { error: glErr } = await supabase.from('global_lineup').delete()
              .eq('manager_id', currentUser.id).eq('artist_id', artistId);
            if (glErr) console.warn('Failed to remove global_lineup row:', glErr.message);
            const { error: vaErr } = await supabase.from('venue_assignments').delete()
              .eq('manager_id', currentUser.id).eq('artist_id', artistId);
            if (vaErr) console.warn('Failed to remove venue_assignments rows:', vaErr.message);
          }
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId,
            type: 'lineup_removed',
            title: 'Removed from Lineup',
            body: `${currentUser?.fullName ?? 'A manager'} removed you from their artist lineup.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
  };

  const openAssignSheet = (artistId: string) => {
    setAssignDJId(artistId);
    setShowAssignSheet(true);
  };

  const handleAddToVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert(
      'Add to Venue',
      `Add ${djName} to ${venueName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: () => {
            const grEntry = myGlobalLineup.find((r) => r.artistId === assignDJId);
            const newAssignment: VenueAssignment = {
              id: `va-${Date.now()}`,
              globalLineupId: grEntry?.id ?? '',
              venueId,
              artistId: assignDJId,
              assignedAt: new Date().toISOString(),
              status: 'active',
            };
            assignToVenue(newAssignment);
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: assignDJId,
              type: 'venue_assigned',
              title: 'Assigned to Venue',
              body: `${currentUser?.fullName ?? 'A manager'} assigned you to ${venueName}.`,
              isRead: false,
              relatedId: venueId,
              relatedType: 'venue',
              createdAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  };

  const handleRemoveFromVenue = (venueId: string) => {
    const venueName = venues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = getArtistUser(assignDJId)?.fullName ?? 'Artist';
    Alert.alert(
      'Remove from Venue',
      `Remove ${djName} from ${venueName}? They will stay on your global lineup.`,
      [
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
            userId: assignDJId,
            type: 'venue_removed',
            title: 'Removed from Venue',
            body: `${currentUser?.fullName ?? 'A manager'} removed you from ${venueName}.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { Alert.alert('Required', 'Please enter an email address.'); return; }
    setIsInviting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsInviting(false);
    Alert.alert('Invite Sent', `An invitation has been sent to ${inviteEmail}.`);
    setInviteEmail('');
    setShowInviteModal(false);
  };

  // ── Derived for assign sheet ─────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────────
  const renderArtist = ({ item }: { item: typeof djListGlobal[0] }) => {
    if (!item.user) return null;
    const completedGigs = getCompletedGigs(item.user.id);

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Top row: avatar + info */}
        <View style={styles.cardTop}>
          <AvatarImage uri={item.user.profilePhotoUrl} name={item.user.fullName} size={52} />
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {item.user.fullName}
            </Text>
            <Text style={[styles.cardGenre, { color: colors.muted }]} numberOfLines={1}>
              {item.profile?.primaryGenre ?? 'Artist'}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <MaterialIcons name="check-circle" size={11} color={colors.success} />
                <Text style={[styles.statText, { color: colors.muted }]}>
                  {completedGigs} gig{completedGigs !== 1 ? 's' : ''}
                </Text>
              </View>
              {item.assignedVenues.length > 0 && (
                <>
                  <View style={[styles.statDot, { backgroundColor: colors.border }]} />
                  <View style={styles.statChip}>
                    <MaterialIcons name="location-on" size={11} color={colors.primary} />
                    <Text style={[styles.statText, { color: colors.primary }]}>
                      {item.assignedVenues.length} venue{item.assignedVenues.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.disconnectBtn, { opacity: pressed ? 0.55 : 1 }]}
            onPress={() => handleDisconnect(item.user!.id, item.user!.fullName)}
          >
            <MaterialIcons name="link-off" size={20} color={colors.error} />
          </Pressable>
        </View>

        {/* Inline action buttons */}
        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          {/* View Profile */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: pressed ? colors.background : 'transparent' },
            ]}
            onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + item.user!.id) as Href)}
          >
            <MaterialIcons name="person" size={15} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Profile</Text>
          </Pressable>

          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

          {/* Assign Venue */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: pressed ? colors.background : 'transparent' },
            ]}
            onPress={() => openAssignSheet(item.user!.id)}
          >
            <MaterialIcons name="add-business" size={15} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Assign Venue</Text>
          </Pressable>

          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

          {/* Bookings */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: pressed ? colors.background : 'transparent' },
            ]}
            onPress={() => router.push(('/(manager)/artist-bookings?artistId=' + item.user!.id) as Href)}
          >
            <MaterialIcons name="event-note" size={15} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Bookings</Text>
          </Pressable>
        </View>
      </View>
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Artists</Text>
        <Pressable
          style={({ pressed }) => [styles.discoverBtn, { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.push('/(manager)/(tabs)/network?tab=artists' as Href)}
        >
          <MaterialIcons name="explore" size={15} color={colors.primary} />
          <Text style={[styles.discoverBtnText, { color: colors.primary }]}>Discover</Text>
        </Pressable>
      </View>

      {/* Artist list */}
      <FlatList
        data={djListGlobal}
        keyExtractor={(item) => item.entry.id}
        renderItem={renderArtist}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 8) + 24 + 50 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="group"
            title="No artists on your lineup"
            subtitle="Add artists to your lineup, then assign them to your venues."
          />
        }
      />

      {/* ── Assign Venue Sheet ────────────────────────────────────────────────── */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            {/* Artist header */}
            <View style={styles.sheetArtistRow}>
              <AvatarImage uri={assignDJUser?.profilePhotoUrl} name={assignDJUser?.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {assignDJName}
                </Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]} numberOfLines={1}>
                  {assignArtistProfile?.primaryGenre ?? 'Artist'}
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} style={styles.venueScrollList} showsVerticalScrollIndicator={false}>
              {/* Unassigned venues — shown first */}
              {unassignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                    ADD TO VENUE
                  </Text>
                  {unassignedVenues.map((v) => (
                    <Pressable
                      key={v.id}
                      style={({ pressed }) => [
                        styles.venueRow,
                        { backgroundColor: pressed ? colors.surface : colors.background, borderColor: colors.border },
                      ]}
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

              {/* Assigned venues — shown second */}
              {assignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: unassignedVenues.length > 0 ? 16 : 0 }]}>ASSIGNED</Text>
                  {assignedVenues.map((v) => (
                    <View
                      key={v.id}
                      style={[styles.venueRow, { backgroundColor: colors.primary + '0A', borderColor: colors.primary + '40' }]}
                    >
                      <View style={[styles.venueRowIcon, { backgroundColor: colors.primary + '15' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.venueRowInfo}>
                        <Text style={[styles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[styles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      {/* Remove from venue button */}
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.removeVenueBtn,
                          { backgroundColor: colors.error + '15', opacity: pressed ? 0.6 : 1 },
                        ]}
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
                <Text style={[styles.emptyVenues, { color: colors.muted }]}>
                  No venues yet. Add a venue first.
                </Text>
              )}
            </ScrollView>

            {/* Cancel / Done button — always visible */}
            <Pressable
              style={[styles.doneBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowAssignSheet(false)}
            >
              <Text style={[styles.doneBtnText, { color: colors.foreground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Add Artist Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showInviteModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add Artist to Roster</Text>
            <Text style={[styles.sheetSub, { color: colors.muted, marginBottom: 22 }]}>
              Enter the artist's email address. They'll be added once they accept.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>EMAIL ADDRESS</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="artist@example.com"
                placeholderTextColor={colors.muted}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
              />
            </View>
            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => { setShowInviteModal(false); setInviteEmail(''); }}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { opacity: isInviting ? 0.7 : 1 }]}
                onPress={handleInvite}
                disabled={isInviting}
              >
                <Text style={styles.confirmBtnText}>{isInviting ? 'Sending…' : 'Send Invite'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* FAB */}
      <Pressable
        style={[styles.fabWrapper, { bottom: Math.max(insets.bottom, 8) + 24 }]}
        onPress={() => router.push('/(manager)/(tabs)/network?tab=artists' as Href)}
      >
        <LinearGradient
          colors={['#3D7EE8', '#1A56C4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fab}
        >
          <MaterialIcons name="person-add" size={22} color="rgba(255,255,255,0.95)" />
        </LinearGradient>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // ─── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 0.5, gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, flex: 1 },
  backBtn: { width: 32, alignItems: 'flex-start' },
  fabWrapper: { position: 'absolute', right: 24, width: 50, height: 50, borderRadius: 25, shadowColor: '#1A56C4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10 },
  fab: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  discoverBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  discoverBtnText: { fontSize: 13, fontWeight: '700' },

  // ─── List ─────────────────────────────────────────────────────────────────
  list: { padding: 16, gap: 10, flexGrow: 1 },

  // ─── Artist Card ──────────────────────────────────────────────────────────
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  disconnectBtn: { padding: 6, alignSelf: 'flex-start' },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  cardGenre: { fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, fontWeight: '500' },
  statDot: { width: 3, height: 3, borderRadius: 2 },

  // ─── Inline action buttons ─────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row', borderTopWidth: 0.5,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  actionDivider: { width: 0.5, marginVertical: 8 },

  // ─── Overlay / Sheet ──────────────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0,
    maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetArtistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },

  venueScrollList: { flexGrow: 0, maxHeight: 380 },
  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  venueRowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  venueRowInfo: { flex: 1 },
  venueRowName: { fontSize: 15, fontWeight: '700' },
  venueRowType: { fontSize: 12, marginTop: 1 },
  removeVenueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  removeVenueBtnText: { fontSize: 12, fontWeight: '600' },
  emptyVenues: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },

  // Done button — always visible at bottom of sheet
  doneBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 14, marginBottom: 44,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700' },

  // ─── Invite modal ─────────────────────────────────────────────────────────
  fieldGroup: { gap: 7, marginBottom: 24 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  sheetActions: { flexDirection: 'row', gap: 12, paddingBottom: 44 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#2E75B6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
