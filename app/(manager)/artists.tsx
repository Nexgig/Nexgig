import { useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, Modal,
  TextInput, Alert, ScrollView,
} from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '@/components/ui/avatar-image';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useVenueStore, useLineupStore, useBookingStore, useNotificationStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { genreLabel } from '@/lib/utils';
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
            body: `${currentUser?.fullName ?? 'A manager'}`,
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
    supabase.from('venue_assignments').upsert(
      { manager_id: currentUser!.id, artist_id: assignDJId, venue_id: venueId, status: 'active' },
      { onConflict: 'venue_id,artist_id' }
    ).then(({ error }) => { if (error) console.warn('venue_assignment upsert error:', error.message); });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: assignDJId,
      type: 'venue_assigned',
      title: 'Assigned to Venue',
      body: `${venueName}`,
      isRead: false,
      relatedId: venueId,
      relatedType: 'venue',
      createdAt: new Date().toISOString(),
    });
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
            body: `${venueName}`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
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
    const metaLine = genreLabel(item.profile?.primaryGenre, item.profile?.instruments);

    return (
      <Pressable
        style={({ pressed }) => [styles.rowCard, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + item.user!.id) as Href)}
      >
        <View style={styles.cardLeft}>
          <AvatarImage uri={item.user.profilePhotoUrl || undefined} avatarId={(item.user as any).avatarId ?? undefined} seed={item.user.id} name={item.user.fullName} size={48} />
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.cardName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                {item.user.fullName}
              </Text>
              {item.profile?.hasCompletedBooking && (
                <MaterialIcons name="verified" size={15} color={colors.primary} />
              )}
            </View>
            <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
              {metaLine}
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.bookingsBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          onPress={(e) => { e.stopPropagation?.(); router.push(('/(manager)/artist-bookings?artistId=' + item.user!.id) as Href); }}
          hitSlop={10}
        >
          <MaterialIcons name="event-note" size={18} color={colors.primary} />
        </Pressable>
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Artists</Text>
      </View>

      {/* Artist list */}
      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={djListGlobal}
        keyExtractor={(item) => item.entry.id}
        renderItem={renderArtist}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 8) + 24 }]}
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

  // ─── List ─────────────────────────────────────────────────────────────────
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },

  // ─── Artist Card ──────────────────────────────────────────────────────────
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  disconnectBtn: { padding: 6, alignSelf: 'flex-start' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  cardMeta: { fontSize: 13 },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bookingsBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

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
  confirmBtn: { flex: 1, backgroundColor: '#E2674A', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
