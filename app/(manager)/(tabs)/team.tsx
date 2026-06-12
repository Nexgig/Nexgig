import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, Image, ScrollView,
  Modal, TextInput, Alert, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useVenueStore, useLineupStore, useBookingStore, useNotificationStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import type { Venue, VenueAssignment } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

type SubTab = 'venues' | 'lineup';

export default function TeamScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);

  // ── Sub-tab toggle ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SubTab>('venues');

  // ── Shared store data ──────────────────────────────────────────────────────
  const allVenues = useVenueStore((s) => s.venues);
  const reorderVenues = useVenueStore((s) => s.reorderVenues);
  const getAssignmentsByVenue = useLineupStore((s) => s.getAssignmentsByVenue);

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VENUES SUB-VIEW STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [isReordering, setIsReordering] = useState(false);
  const [orderedVenues, setOrderedVenues] = useState<Venue[]>([]);

  const enterReorder = useCallback(() => {
    setOrderedVenues([...venues]);
    setIsReordering(true);
  }, [venues]);

  const saveReorder = useCallback(() => {
    reorderVenues(orderedVenues.map((v) => v.id));
    setIsReordering(false);
  }, [reorderVenues, orderedVenues]);

  const cancelReorder = useCallback(() => {
    setIsReordering(false);
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setOrderedVenues((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setOrderedVenues((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // LINEUP SUB-VIEW STATE
  // ══════════════════════════════════════════════════════════════════════════
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const removeFromGlobalLineup = useLineupStore((s) => s.removeFromGlobalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);
  const bookings = useBookingStore((s) => s.bookings);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
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
    const completedCount = getCompletedGigs(artistId);
    const message = completedCount > 0
      ? `${djName} has ${completedCount} completed gig${completedCount > 1 ? 's' : ''} on record. Their gig history will be preserved. This will remove them from your lineup and all venues.`
      : `Remove ${djName} from your lineup? This will also remove them from all venues.`;
    Alert.alert(
      'Remove from Lineup',
      message,
      [
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
    Alert.alert('Add to Venue', `Add ${djName} to ${venueName}?`, [
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
    ]);
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

  // Assign sheet derived data
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

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER ACTIONS (context-aware)
  // ══════════════════════════════════════════════════════════════════════════
  const renderHeaderActions = () => {
    if (activeTab === 'venues') {
      if (isReordering) {
        return (
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.ghostBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={cancelReorder}
            >
              <Text style={[styles.ghostBtnText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={saveReorder}
            >
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        );
      }
      return (
        <View style={styles.headerActions}>
          {venues.length > 1 && (
            <Pressable
              style={({ pressed }) => [styles.ghostBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={enterReorder}
            >
              <MaterialIcons name="swap-vert" size={18} color={colors.foreground} />
              <Text style={[styles.ghostBtnText, { color: colors.foreground }]}>Reorder</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push('/(manager)/create-venue' as Href)}
          >
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      );
    }
    // Lineup sub-tab
    return (
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.8 : 1 }]}
        onPress={() => router.push('/(manager)/invite-artist' as Href)}
      >
        <MaterialIcons name="person-add" size={18} color="#fff" />
      </Pressable>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // VENUES RENDER
  // ══════════════════════════════════════════════════════════════════════════
  const renderVenue = ({ item }: { item: Venue }) => {
    const lineupCount = getAssignmentsByVenue(item.id).length;
    return (
      <Pressable
        style={({ pressed }) => [styles.venueCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
        onPress={() => router.push(('/(manager)/venue-detail?id=' + item.id) as Href)}
      >
        {item.photoUrls[0] ? (
          <Image source={{ uri: item.photoUrls[0] }} style={styles.venuePhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.venuePhotoPlaceholder, { backgroundColor: colors.navy }]}>
            <MaterialIcons name="business" size={32} color="#2563EB" />
          </View>
        )}
        <View style={styles.venueContent}>
          <View style={styles.venueHeader}>
            <View style={styles.venueTitleRow}>
              <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
              {item.isHidden && <StatusBadge status="hidden" />}
            </View>
            <Text style={[styles.venueType, { color: colors.muted }]}>{item.venueType}</Text>
          </View>
          <View style={styles.venueFooter}>
            <View style={styles.venueMetaItem}>
              <MaterialIcons name="location-on" size={14} color={colors.muted} />
              <Text style={[styles.venueMeta, { color: colors.muted }]} numberOfLines={1}>
                {item.googleMapsLocation?.address ?? 'No location'}
              </Text>
            </View>
            <View style={styles.venueMetaItem}>
              <MaterialIcons name="group" size={14} color={colors.muted} />
              <Text style={[styles.venueMeta, { color: colors.muted }]}>{lineupCount} artist{lineupCount !== 1 ? 's' : ''}</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} style={styles.chevron} />
      </Pressable>
    );
  };

  const renderReorderRow = (item: Venue, index: number, total: number) => (
    <View
      key={item.id}
      style={[styles.reorderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.positionBadge, { backgroundColor: colors.primary + '20' }]}>
        <Text style={[styles.positionText, { color: colors.primary }]}>{index + 1}</Text>
      </View>
      <View style={[styles.reorderDot, { backgroundColor: item.color ?? colors.primary }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.reorderName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.reorderType, { color: colors.muted }]} numberOfLines={1}>{item.venueType}</Text>
      </View>
      <View style={styles.arrowGroup}>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, { opacity: (pressed || index === 0) ? 0.35 : 1 }]}
          onPress={() => moveUp(index)}
          disabled={index === 0}
        >
          <MaterialIcons name="keyboard-arrow-up" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.arrowBtn, { opacity: (pressed || index === total - 1) ? 0.35 : 1 }]}
          onPress={() => moveDown(index)}
          disabled={index === total - 1}
        >
          <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LINEUP RENDER
  // ══════════════════════════════════════════════════════════════════════════
  const renderArtist = ({ item }: { item: typeof djListGlobal[0] }) => {
    if (!item.user) return null;
    const completedGigs = getCompletedGigs(item.user.id);
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <ScreenContainer>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Team</Text>
        {renderHeaderActions()}
      </View>

      {/* ── Segmented Toggle ── */}
      <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.toggleBtn, activeTab === 'venues' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => { setActiveTab('venues'); setIsReordering(false); }}
        >
          <Text style={[styles.toggleBtnText, { color: activeTab === 'venues' ? colors.primary : colors.muted }]}>
            Venues
          </Text>
          <View style={[styles.toggleBadge, { backgroundColor: activeTab === 'venues' ? colors.primary + '20' : colors.surface }]}>
            <Text style={[styles.toggleBadgeText, { color: activeTab === 'venues' ? colors.primary : colors.muted }]}>
              {venues.length}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, activeTab === 'lineup' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => { setActiveTab('lineup'); setIsReordering(false); }}
        >
          <Text style={[styles.toggleBtnText, { color: activeTab === 'lineup' ? colors.primary : colors.muted }]}>
            Lineup
          </Text>
          <View style={[styles.toggleBadge, { backgroundColor: activeTab === 'lineup' ? colors.primary + '20' : colors.surface }]}>
            <Text style={[styles.toggleBadgeText, { color: activeTab === 'lineup' ? colors.primary : colors.muted }]}>
              {djListGlobal.length}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* ── Venues Sub-view ── */}
      {activeTab === 'venues' && (
        isReordering ? (
          <ScrollView
            contentContainerStyle={[styles.list, { paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.reorderHint, { color: colors.muted }]}>
              Use the arrows to set your preferred order. This applies everywhere in the app.
            </Text>
            {orderedVenues.map((item, index) =>
              renderReorderRow(item, index, orderedVenues.length)
            )}
          </ScrollView>
        ) : (
          <FlatList
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
            data={venues}
            keyExtractor={(item) => item.id}
            renderItem={renderVenue}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="business"
                title="No venues yet"
                subtitle="Create your first venue to start managing bookings and lineups."
              />
            }
          />
        )
      )}

      {/* ── Lineup Sub-view ── */}
      {activeTab === 'lineup' && (
        <FlatList
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
          data={djListGlobal}
          keyExtractor={(item) => item.entry.id}
          renderItem={renderArtist}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="group"
              title="No artists on your lineup"
              subtitle="Add artists to your lineup, then assign them to your venues."
            />
          }
        />
      )}

      {/* ── Assign Venue Sheet ── */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetArtistRow}>
              <AvatarImage uri={assignDJUser?.profilePhotoUrl} name={assignDJUser?.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>{assignDJName}</Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]} numberOfLines={1}>
                  {assignArtistProfile?.primaryGenre ?? 'Artist'}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} style={styles.venueScrollList} showsVerticalScrollIndicator={false}>
              {/* Unassigned venues — shown first */}
              {unassignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>ADD TO VENUE</Text>
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

      {/* ── Add Artist Floating Sheet (matches Add Slot style) ── */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
      >
        {/* Dim overlay — tap outside to dismiss */}
        <Pressable
          style={inviteSheetStyles.kavWrapper}
          onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
        >
          {/* Sheet card — stop press propagation */}
          <Pressable style={[inviteSheetStyles.sheet, { backgroundColor: colors.background }]} onPress={() => Keyboard.dismiss()}>
            {/* Drag handle */}
            <View style={inviteSheetStyles.handleRow}>
              <View style={[inviteSheetStyles.handle, { backgroundColor: colors.border }]} />
            </View>
            {/* Header */}
            <View style={inviteSheetStyles.header}>
              <View>
                <Text style={[inviteSheetStyles.sheetTitle, { color: colors.foreground }]}>Add Artist</Text>
                <Text style={[inviteSheetStyles.sheetSub, { color: colors.muted }]}>Invite by email to your lineup</Text>
              </View>
              <Pressable
                style={[inviteSheetStyles.closeBtn, { backgroundColor: colors.surface }]}
                onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
            {/* Email field */}
            <View style={inviteSheetStyles.fieldBlock}>
              <Text style={[inviteSheetStyles.fieldLabel, { color: colors.muted }]}>EMAIL ADDRESS</Text>
              <TextInput
                style={[inviteSheetStyles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="artist@example.com"
                placeholderTextColor={colors.muted}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={handleInvite}
              />
            </View>
            {/* Action buttons */}
            <View style={inviteSheetStyles.actions}>
              <Pressable
                style={({ pressed }) => [inviteSheetStyles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setInviteEmail(''); }}
              >
                <Text style={[inviteSheetStyles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [inviteSheetStyles.confirmBtn, { opacity: (isInviting || pressed) ? 0.7 : 1 }]}
                onPress={handleInvite}
                disabled={isInviting}
              >
                <MaterialIcons name="person-add" size={16} color="#fff" />
                <Text style={inviteSheetStyles.confirmBtnText}>{isInviting ? 'Sending…' : 'Send Invite'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600' },

  // Segmented toggle
  toggleRow: {
    flexDirection: 'row', borderBottomWidth: 0.5,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  toggleBtnText: { fontSize: 15, fontWeight: '700' },
  toggleBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  toggleBadgeText: { fontSize: 12, fontWeight: '600' },

  // List
  list: { padding: 16, gap: 12, flexGrow: 1 },

  // Venue card
  venueCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  venuePhoto: { width: 80, height: 80 },
  venuePhotoPlaceholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  venueContent: { flex: 1, padding: 14, gap: 8 },
  venueHeader: { gap: 2 },
  venueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  venueName: { fontSize: 16, fontWeight: '700', flex: 1 },
  venueType: { fontSize: 13 },
  venueFooter: { flexDirection: 'row', gap: 14 },
  venueMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueMeta: { fontSize: 12 },
  chevron: { marginRight: 12 },

  // Reorder mode
  reorderHint: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  reorderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14,
  },
  positionBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  positionText: { fontSize: 13, fontWeight: '800' },
  reorderDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  reorderName: { fontSize: 15, fontWeight: '700' },
  reorderType: { fontSize: 12, marginTop: 2 },
  arrowGroup: { flexDirection: 'column', alignItems: 'center', gap: 0, marginRight: -4 },
  arrowBtn: { padding: 4 },

  // Artist card
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

  // Overlay / Sheet
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
  removeVenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  removeVenueBtnText: { fontSize: 12, fontWeight: '600' },
  emptyVenues: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 44 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },

  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ─── Add Artist floating sheet styles (matches Add Slot panel) ────────────────
const inviteSheetStyles = StyleSheet.create({
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 260,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderRadius: 24,
    marginHorizontal: 8,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
  },
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingTop: 4, paddingBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  sheetSub: { fontSize: 13, fontWeight: '500' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fieldBlock: { marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 14 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
