import { Fragment, useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, TextInput, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useSlotStore, useLineupStore, useBookingStore, useAvailabilityStore, useVenueStore, useDraftStore, useNotificationStore, venuePhotoUri } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { detectConflicts, timesOverlap, formatDate, formatTime } from '@/lib/conflict-detection';
import type { Booking, VenueAssignment, ConflictInfo } from '@/lib/types';
import { isPastStart, performerLabel } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function AssignDJScreen() {
  const router = useRouter();
  const colors = useColors();
  // Support both slotId (slot assignment) and venueId (venue lineup assignment)
  const { slotId, venueId: venueIdParam } = useLocalSearchParams<{ slotId?: string; venueId?: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);

  const getSlotById = useSlotStore((s) => s.getSlotById);
  const deleteSlot = useSlotStore((s) => s.deleteSlot);
  const slot = slotId ? getSlotById(slotId) : undefined;

  // Lineup store — subscribe to raw array for reactivity
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);

  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getSlotById2 = useSlotStore((s) => s.getSlotById);
  const allBookings = useBookingStore((s) => s.bookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const confirmedBookings = useMemo(
    () => allBookings.filter((b) => b.status === 'confirmed' || b.status === 'requested'),
    [allBookings]
  );
  const blocks = useAvailabilityStore((s) => s.blocks);

  // Subscribe to the raw drafts array so the component re-renders on every change
  const allDrafts = useDraftStore((s) => s.drafts);
  const setDraft = useDraftStore((s) => s.setDraft);
  const removeDraftByDJ = useDraftStore((s) => s.removeDraftByDJ);
  const getBookingsBySlot = useBookingStore((s) => s.getBookingsBySlot);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // ── VENUE LINEUP MODE (no slot) ───────────────────────────────────────────
  // When venueId param is provided, show global lineup artists and let manager assign them to this venue
  const isVenueLineupMode = !slotId && !!venueIdParam;
  const venueForLineup = venueIdParam ? getVenueById(venueIdParam) : undefined;

  // Active assignments for this venue (reactive — subscribed to raw array)
  const activeVenueAssignmentIds = useMemo(
    () => new Set(
      venueAssignments
        .filter((a) => a.venueId === venueIdParam && a.status === 'active')
        .map((a) => a.artistId)
    ),
    [venueAssignments, venueIdParam]
  );

  // Global lineup artists for this manager (not yet assigned to this venue)
  const myGlobalLineup = useMemo(
    () => globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active'),
    [globalLineup, currentUser?.id]
  );

  const [venueSearch, setVenueSearch] = useState('');

  // ── Cross-manager conflict detection ─────────────────────────────────────
  // Fetch confirmed bookings + blocks from OTHER managers for lineup artists on this slot's date
  const [crossConflicts, setCrossConflicts] = useState<Map<string, ConflictInfo[]>>(new Map());

  useEffect(() => {
    if (!slot || !currentUser || isVenueLineupMode) return;
    const assignmentsForSlot = venueAssignments.filter(
      (a) => a.venueId === slot.venueId && a.status === 'active'
    );
    const artistIds = assignmentsForSlot.map((a) => a.artistId);
    if (artistIds.length === 0) { setCrossConflicts(new Map()); return; }

    let cancelled = false;
    Promise.all([
      // Other managers' CONFIRMED bookings are not readable directly under RLS
      // (managers can only see their own bookings). This SECURITY DEFINER RPC
      // returns ONLY busy time-ranges — no venue, no manager — so we can flag the
      // artist as unavailable without leaking where/with whom they're booked.
      supabase.rpc('get_artist_busy_times', { p_artist_ids: artistIds, p_date: slot.date }),
      // availability_blocks is world-readable to authenticated users, so this
      // direct query works cross-manager and stays as-is.
      supabase
        .from('availability_blocks')
        .select('id, artist_id, start_time, end_time, is_full_day, block_type, event_name')
        .in('artist_id', artistIds)
        .eq('date', slot.date),
    ]).then(([busyRes, blocksRes]) => {
      if (cancelled) return;
      const map = new Map<string, ConflictInfo[]>();
      const add = (artistId: string, c: ConflictInfo) => {
        map.set(artistId, [...(map.get(artistId) ?? []), c]);
      };
      (busyRes.data ?? []).forEach((b: any) => {
        if (!b.start_time || !b.end_time) return;
        if (timesOverlap(b.start_time, b.end_time, slot.startTime, slot.endTime, slot.date, slot.date)) {
          add(b.artist_id, {
            // Venue intentionally omitted — another manager's venue is private.
            type: 'booking',
            description: `Booked elsewhere ${b.start_time}–${b.end_time}`,
            startTime: b.start_time,
            endTime: b.end_time,
          });
        }
      });
      (blocksRes.data ?? []).forEach((bl: any) => {
        const bStart = bl.is_full_day ? '00:00' : bl.start_time;
        const bEnd = bl.is_full_day ? '23:59' : bl.end_time;
        if (timesOverlap(bStart, bEnd, slot.startTime, slot.endTime, slot.date, slot.date)) {
          add(bl.artist_id, {
            type: 'availability_block',
            description: `Unavailable ${bStart}–${bEnd}`,
            startTime: bStart,
            endTime: bEnd,
          });
        }
      });
      setCrossConflicts(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [slot?.id, slot?.date, slot?.venueId, currentUser?.id, isVenueLineupMode, venueAssignments]);

  const unassignedLineupArtists = useMemo(
    () => myGlobalLineup
      .filter((entry) => !activeVenueAssignmentIds.has(entry.artistId))
      .map((entry) => ({
        entry,
        user: getArtistUser(entry.artistId),
        profile: getArtistProfile(entry.artistId),
      }))
      .filter((item) => {
        if (!item.user) return false;
        if (!venueSearch.trim()) return true;
        const q = venueSearch.toLowerCase();
        return (item.user.fullName ?? '').toLowerCase().includes(q) ||
          (item.profile?.primaryGenre ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? '')),
    [myGlobalLineup, activeVenueAssignmentIds, getArtistUser, getArtistProfile, venueSearch]
  );

  const handleAddToVenueLineup = (artistId: string) => {
    if (!currentUser || !venueIdParam) return;
    const venueName = venueForLineup?.name ?? 'this venue';
    const grEntry = myGlobalLineup.find((r) => r.artistId === artistId);
    const newAssignment: VenueAssignment = {
      id: `va-${Date.now()}`,
      globalLineupId: grEntry?.id ?? '',
      venueId: venueIdParam,
      artistId,
      assignedAt: new Date().toISOString(),
      status: 'active',
    };
    assignToVenue(newAssignment);
    supabase.from('venue_assignments').upsert(
      { manager_id: currentUser.id, artist_id: artistId, venue_id: venueIdParam, status: 'active' },
      { onConflict: 'venue_id,artist_id' }
    ).then(({ error }) => { if (error) console.warn('venue_assignment upsert error:', error.message); });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artistId,
      type: 'venue_assigned',
      title: 'Assigned to Venue',
      body: `${venueName}`,
      isRead: false,
      relatedId: venueIdParam,
      relatedType: 'venue',
      createdAt: new Date().toISOString(),
    });
  };

  // ── SLOT ASSIGNMENT MODE ──────────────────────────────────────────────────
  if (!isVenueLineupMode && !slot) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Set not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  // ── VENUE LINEUP MODE RENDER ──────────────────────────────────────────────
  if (isVenueLineupMode) {
    return (
      <ScreenContainer>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Artist</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>{venueForLineup?.name ?? 'Venue'}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search artists..."
            placeholderTextColor={colors.muted}
            value={venueSearch}
            onChangeText={setVenueSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {venueSearch.length > 0 && (
            <Pressable onPress={() => setVenueSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Info note */}
        <View style={[styles.infoNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="info-outline" size={14} color={colors.muted} />
          <Text style={[styles.infoNoteText, { color: colors.muted }]}>
            Select an artist from your global lineup to add them to this venue.
          </Text>
        </View>

        <FlatList
          style={{ flex: 1, backgroundColor: colors.background }}
          ItemSeparatorComponent={() => <Divider full />}
          removeClippedSubviews={true}
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          data={unassignedLineupArtists}
          keyExtractor={(item) => item.entry.artistId}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="group" size={40} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {myGlobalLineup.length === 0
                  ? 'No artists in your lineup yet'
                  : 'All lineup artists are already assigned to this venue'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.djRow, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => handleAddToVenueLineup(item.entry.artistId)}
            >
              <AvatarImage uri={item.user!.profilePhotoUrl || undefined} avatarId={item.user!.avatarId} seed={item.user!.id} name={item.user!.fullName} size={48} />
              <View style={styles.djInfo}>
              <Text style={[styles.djName, { color: colors.foreground }]}>{item.user!.fullName}</Text>
                <Text style={[styles.djGenre, { color: colors.muted }]}>{performerLabel(item.profile?.instruments)}</Text>
              </View>
              <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
            </Pressable>
          )}
        />
      </ScreenContainer>
    );
  }

  // ── SLOT ASSIGNMENT MODE (existing logic) ─────────────────────────────────
  // Determine if this is a past slot (uses date + startTime for accurate datetime comparison)
  const isPastSlot = isPastStart(slot!.date, slot!.startTime);
  const venue = getVenueById(slot!.venueId);

  const venueAssignmentsForSlot = venueAssignments.filter(
    (a) => a.venueId === slot!.venueId && a.status === 'active'
  );
  // Derive current drafts for this slot directly from the reactive array
  const currentDrafts = allDrafts.filter((d) => d.slotId === slot!.id);
  const slotBookings = getBookingsBySlot(slot!.id);
  // DJs already assigned (draft or booking) — used to mark cards as drafted/booked
  const assignedDJIds = new Set([
    ...currentDrafts.map((d) => d.artistId),
    ...slotBookings.map((b) => b.artistId),
  ]);

  // Build per-DJ draft slot lookup for conflict checking
  const draftSlotsByDJ = (artistId: string) => allDrafts
    .filter((d) => d.artistId === artistId)
    .map((d) => {
      const s = getSlotById2(d.slotId);
      if (!s) return null;
      return {
        slotId: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        venueName: getVenueById(s.venueId)?.name ?? 'Unknown Venue',
        slotName: s.name,
      };
    })
    .filter(Boolean) as Array<{ slotId: string; date: string; startTime: string; endTime: string; venueName: string; slotName: string }>;

  const djsWithConflicts = venueAssignmentsForSlot.map((a) => {
    const user = getArtistUser(a.artistId);
    const profile = getArtistProfile(a.artistId);
    if (!user) return null;
    const localConflicts = detectConflicts(
      a.artistId, slot!, confirmedBookings, blocks,
      (venueId) => getVenueById(venueId)?.name ?? 'Unknown Venue',
      getSlotById2,
      draftSlotsByDJ(a.artistId),
      allBookings
    );
    // Merge with cross-manager conflicts from Supabase
    const external = crossConflicts.get(a.artistId) ?? [];
    const allConflicts = [...localConflicts, ...external];
    return { user, profile, hasConflict: allConflicts.length > 0, conflicts: allConflicts, assignment: a };
  }).filter(Boolean) as Array<{
    user: NonNullable<ReturnType<typeof getArtistUser>>;
    profile: ReturnType<typeof getArtistProfile>;
    hasConflict: boolean;
    conflicts: ReturnType<typeof detectConflicts>;
    assignment: typeof venueAssignmentsForSlot[0];
  }>;

  // Was a useMemo here — changed to plain computation because its dependency chain
  // includes values defined below early-return branches, which broke rules-of-hooks.
  // The filter runs on a small artist list, so losing memoization is imperceptible.
  const available = djsWithConflicts
    .filter((d) => !d.hasConflict)
    .sort((a, b) => (a.user.fullName ?? '').toLowerCase().localeCompare((b.user.fullName ?? '').toLowerCase()));
  const withConflict = djsWithConflicts
    .filter((d) => d.hasConflict)
    .sort((a, b) => (a.user.fullName ?? '').toLowerCase().localeCompare((b.user.fullName ?? '').toLowerCase()));

  // Roster (global-lineup) artists NOT on this venue's lineup yet. The manager can
  // add them to the venue right here; once added they move up into Available /
  // Has Conflict and get assigned normally (draft, or past-confirmation request).
  const venueLineupIds = new Set(venueAssignmentsForSlot.map((a) => a.artistId));
  const notInLineup = myGlobalLineup
    .filter((entry) => !venueLineupIds.has(entry.artistId))
    .map((entry) => ({ entry, user: getArtistUser(entry.artistId), profile: getArtistProfile(entry.artistId) }))
    .filter((item) => !!item.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  // For past slots: tapping a DJ sends a past-gig confirmation request to the artist
  const handleTapDJPast = (artistId: string) => {
    if (!currentUser) return;
    // If already has a booking (any status) for this DJ on this slot, do nothing
    if (assignedDJIds.has(artistId)) return;
    const djUser = getArtistUser(artistId);
    Alert.alert(
      'Send Completed Gig Request',
      `Send a completed gig request to ${djUser?.fullName ?? 'this artist'} for "${slot!.name}" on ${formatDate(slot!.date)}?\n\nThey will be asked to confirm or decline this completed gig.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { deleteSlot(slot!.id); router.back(); } },
        {
          text: 'Send Completed Request',
          onPress: () => {
            const now = new Date().toISOString();
            const bookingId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            const booking: Booking = {
              id: bookingId,
              slotId: slot!.id,
              venueId: slot!.venueId,
              artistId,
              managerId: currentUser.id,
              status: 'requested',
              isCompleted: false,
              createdAt: now,
              updatedAt: now,
              slotDate: slot!.date,
              slotName: slot!.name,
              slotStartTime: slot!.startTime,
              slotEndTime: slot!.endTime,
              venueName: venue?.name,
            };
            addBooking(booking);
            // Save to Supabase
            supabase.from('bookings').insert({
              id: bookingId,
              slot_id: slot!.id,
              venue_id: slot!.venueId,
              artist_id: artistId,
              manager_id: currentUser.id,
              status: 'requested',
              is_completed: false,
              slot_date: slot!.date,
              slot_name: slot!.name,
              slot_start_time: slot!.startTime,
              slot_end_time: slot!.endTime,
              venue_name: venue?.name ?? null,
              venue_photo_url: venuePhotoUri(venue) ?? null,
            }).then(({ error }) => {
              if (error) console.warn('past booking insert error:', error.message);
            });
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: artistId,
              type: 'past_confirmation_request',
              title: 'Confirm Past Gig',
              body: `${venue?.name ?? 'a venue'} — ${formatDate(slot!.date)}`,
              isRead: false,
              relatedId: booking.id,
              relatedType: 'booking',
              createdAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  };

  const handleTapDJ = (artistId: string) => {
    if (isPastSlot) {
      handleTapDJPast(artistId);
      return;
    }
    if (!currentUser) return;
    // Toggle: if already drafted, remove; otherwise add
    if (assignedDJIds.has(artistId)) {
      removeDraftByDJ(slot!.id, artistId);
    } else {
      setDraft(slot!.id, slot!.venueId, artistId, currentUser.id);
    }
  };

  // Add a roster artist to THIS venue's lineup from the slot screen. No draft is
  // created — once added they surface in Available / Has Conflict where a normal
  // tap assigns them (draft for upcoming, completed-gig request for past slots).
  const handleAddToVenueFromSlot = (artistId: string) => {
    if (!currentUser) return;
    const venueName = venue?.name ?? 'this venue';
    const grEntry = myGlobalLineup.find((r) => r.artistId === artistId);
    const newAssignment: VenueAssignment = {
      id: `va-${Date.now()}`,
      globalLineupId: grEntry?.id ?? '',
      venueId: slot!.venueId,
      artistId,
      assignedAt: new Date().toISOString(),
      status: 'active',
    };
    assignToVenue(newAssignment);
    supabase.from('venue_assignments').upsert(
      { manager_id: currentUser.id, artist_id: artistId, venue_id: slot!.venueId, status: 'active' },
      { onConflict: 'venue_id,artist_id' }
    ).then(({ error }) => { if (error) console.warn('venue_assignment upsert error:', error.message); });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artistId,
      type: 'venue_assigned',
      title: 'Assigned to Venue',
      body: `${venueName}`,
      isRead: false,
      relatedId: slot!.venueId,
      relatedType: 'venue',
      createdAt: new Date().toISOString(),
    });
  };

  const renderDJ = (item: typeof djsWithConflicts[0], index = 0) => {
    const isAssigned = assignedDJIds.has(item.user.id);
    // Real booking on this slot for this DJ (any non-cancelled/declined status).
    const bookingForDJ = slotBookings.find((b) => b.artistId === item.user.id);
    // For past slots: show pending if past_confirmation request sent, completed if confirmed
    const isPastPending = isPastSlot && slotBookings.some((b) => b.artistId === item.user.id && (b.status === 'requested' || b.status === 'past_confirmation'));
    const isCompleted = isPastSlot && slotBookings.some((b) => b.artistId === item.user.id && b.isCompleted);
    // Upcoming slots: reflect a real booking's status instead of "Drafted".
    const isConfirmed = !isPastSlot && bookingForDJ?.status === 'confirmed';
    const isPending = !isPastSlot && (bookingForDJ?.status === 'requested' || bookingForDJ?.status === 'past_confirmation');
    // "Drafted" only when it's an actual draft (no real booking on this slot).
    const isDrafted = !isPastSlot && isAssigned && !bookingForDJ;

    return (
      <Fragment key={item.user.id}>
        {index > 0 ? <Divider full /> : null}
      <Pressable
        style={({ pressed }) => [styles.djRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => handleTapDJ(item.user.id)}
      >
        <AvatarImage uri={item.user.profilePhotoUrl || undefined} avatarId={item.user.avatarId} seed={item.user.id} name={item.user.fullName} size={48} />
        <View style={styles.djInfo}>
          <View style={styles.djNameRow}>
            <Text style={[styles.djName, { color: colors.foreground }]}>{item.user.fullName}</Text>
            {isCompleted && (
              <View style={[styles.draftBadge, { backgroundColor: colors.success }]}>
                <MaterialIcons name="check-circle" size={10} color="#fff" />
                <Text style={styles.draftBadgeText}>Completed</Text>
              </View>
            )}
            {isPastPending && (
              <View style={[styles.draftBadge, { backgroundColor: colors.warning }]}>
                <MaterialIcons name="schedule" size={10} color="#fff" />
                <Text style={styles.draftBadgeText}>Pending</Text>
              </View>
            )}
            {isConfirmed && (
              <View style={[styles.draftBadge, { backgroundColor: colors.success }]}>
                <MaterialIcons name="check-circle" size={10} color="#fff" />
                <Text style={styles.draftBadgeText}>Confirmed</Text>
              </View>
            )}
            {isPending && (
              <View style={[styles.draftBadge, { backgroundColor: colors.warning }]}>
                <MaterialIcons name="schedule" size={10} color="#fff" />
                <Text style={styles.draftBadgeText}>Pending</Text>
              </View>
            )}
            {isDrafted && (
              <View style={[styles.draftBadge, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="edit" size={10} color="#fff" />
                <Text style={styles.draftBadgeText}>Drafted</Text>
              </View>
            )}
          </View>
          <Text style={[styles.djGenre, { color: colors.muted }]}>{performerLabel(item.profile?.instruments)}</Text>
          {item.hasConflict && item.conflicts[0] && (
            <View style={styles.conflictBanner}>
              <MaterialIcons name="warning" size={12} color={colors.error} />
              <Text style={[styles.conflictText, { color: colors.error }]} numberOfLines={2}>{item.conflicts[0].description}</Text>
            </View>
          )}
        </View>
        {isCompleted
          ? <MaterialIcons name="check-circle" size={20} color={colors.success} />
          : isConfirmed
          ? <MaterialIcons name="check-circle" size={20} color={colors.success} />
          : isPastPending || isPending
          ? <MaterialIcons name="schedule" size={20} color={colors.warning} />
          : isDrafted
          ? <MaterialIcons name="check-circle" size={20} color={colors.primary} />
          : <MaterialIcons name="add-circle-outline" size={20} color={colors.muted} />
        }
      </Pressable>
      </Fragment>
    );
  };

  return (
    <ScreenContainer style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isPastSlot ? 'Add to Completed Gigs' : 'Assign Artist'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {slot!.name} · {formatDate(slot!.date)} · {formatTime(slot!.startTime)}–{formatTime(slot!.endTime)}
          </Text>
        </View>
      </View>

      {/* Past slots still warn: tapping fires a real request, not a draft. */}
      {isPastSlot && (
        <View style={[styles.infoNote, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
          <MaterialIcons name="history" size={14} color={colors.warning} />
          <Text style={[styles.infoNoteText, { color: colors.warning }]}>
            This slot is in the past. Tapping an artist will send them a completed gig request — they must confirm or decline the completed gig.
          </Text>
        </View>
      )}

      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1 }}
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.listContent}>
            {/* Available */}
            {available.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="check-circle" size={16} color={colors.success} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available ({available.length})</Text>
                </View>
                {available.map((dj, i) => renderDJ(dj, i))}
              </View>
            )}

            {/* With Conflict */}
            {withConflict.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="warning" size={16} color={colors.warning} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Has Conflict ({withConflict.length})</Text>
                </View>
                {withConflict.map((dj, i) => renderDJ(dj, i))}
              </View>
            )}

            {/* Not in Lineup — roster artists not yet on this venue */}
            {notInLineup.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="group-add" size={16} color={colors.muted} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Not in Lineup ({notInLineup.length})</Text>
                </View>
                {notInLineup.map((item, i) => (
                  <Fragment key={item.entry.artistId}>
                  {i > 0 ? <Divider full /> : null}
                  <View style={styles.djRow}>
                    <AvatarImage uri={item.user!.profilePhotoUrl || undefined} avatarId={item.user!.avatarId} seed={item.user!.id} name={item.user!.fullName} size={48} />
                    <View style={styles.djInfo}>
                      <Text style={[styles.djName, { color: colors.foreground }]}>{item.user!.fullName}</Text>
                      <Text style={[styles.djGenre, { color: colors.muted }]}>{performerLabel(item.profile?.instruments)}</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.addPill, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
                      onPress={() => handleAddToVenueFromSlot(item.entry.artistId)}
                      hitSlop={6}
                    >
                      <MaterialIcons name="add" size={15} color={colors.primary} />
                      <Text style={[styles.addPillText, { color: colors.primary }]}>Add</Text>
                    </Pressable>
                  </View>
                  </Fragment>
                ))}
              </View>
            )}

            {djsWithConflicts.length === 0 && notInLineup.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialIcons name="group" size={40} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in your lineup yet</Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={<View style={{ flexGrow: 1, minHeight: 300, backgroundColor: colors.background }} />}
        ListFooterComponentStyle={{ flexGrow: 1 }}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, marginTop: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  infoNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  listContent: { padding: 20, flexGrow: 1 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  djRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  artistPhoto: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  djInfo: { flex: 1 },
  djNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  djName: { fontSize: 15, fontWeight: '700' },
  draftBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  draftBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  addPillText: { fontSize: 13, fontWeight: '700' },
  djGenre: { fontSize: 13, marginBottom: 3 },
  conflictBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  conflictText: { fontSize: 12, flex: 1, lineHeight: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
});
