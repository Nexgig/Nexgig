import { Fragment, useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, Alert } from '@/lib/rn';
import { useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useSlotStore, useLineupStore, useBookingStore, useAvailabilityStore, useVenueStore, useDraftStore, useNotificationStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { fonts } from '@/lib/fonts';
import { useColors } from '@/hooks/use-colors';
import { detectConflicts, timesOverlap, formatDate, formatTime } from '@/lib/conflict-detection';
import type { Booking, VenueAssignment, ConflictInfo } from '@/lib/types';
import { isPastStart, addDaysStr, firstName } from '@/lib/utils';
import { persistGigRequestBooking } from '@/lib/gig-requests';
import { supabase } from '@/lib/supabase';

export default function AssignDJScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
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
  const sendDraftByDJ = useDraftStore((s) => s.sendDraftByDJ);
  // STAGING (mirrors add-slot): tapping an artist only stages them locally — NOTHING is written
  // until "Draft" (commit) or "Send". Seeded from any drafts already on the slot, so the ✕ (which
  // writes nothing) discards this session's changes and leaves the slot exactly as it was.
  const [stagedIds, setStagedIds] = useState<Set<string>>(() =>
    new Set(allDrafts.filter((d) => d.slotId === slotId).map((d) => d.artistId))
  );
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
    // Overnight sets span two calendar days, so a clash can sit on the day either
    // side of this slot's date: 1 Jun 22:00–03:00 collides with 2 Jun 01:00–04:00.
    // Fetch both neighbours and let timesOverlap decide what actually clashes.
    const dates = [addDaysStr(slot.date, -1), slot.date, addDaysStr(slot.date, 1)];
    Promise.all([
      // Other managers' CONFIRMED bookings are not readable directly under RLS
      // (managers can only see their own bookings). This SECURITY DEFINER RPC
      // returns ONLY busy time-ranges — no venue, no manager — so we can flag the
      // artist as unavailable without leaking where/with whom they're booked.
      // It takes one date and its rows carry none, so call it per day and tag them.
      Promise.all(
        dates.map((d) =>
          supabase
            .rpc('get_artist_busy_times', { p_artist_ids: artistIds, p_date: d })
            .then((res: any) => ((res.data ?? []) as any[]).map((row) => ({ ...row, date: d })))
        )
      ).then((perDay) => perDay.flat()),
      // availability_blocks is world-readable to authenticated users, so this
      // direct query works cross-manager and stays as-is.
      supabase
        .from('availability_blocks')
        .select('id, artist_id, date, start_time, end_time, is_full_day, block_type, event_name')
        .in('artist_id', artistIds)
        .in('date', dates),
    ]).then(([busyRows, blocksRes]) => {
      if (cancelled) return;
      const map = new Map<string, ConflictInfo[]>();
      const add = (artistId: string, c: ConflictInfo) => {
        map.set(artistId, [...(map.get(artistId) ?? []), c]);
      };
      // Artists already booked on THIS slot. Their own booking comes back from the
      // RPC as a busy range, so without this they'd flag as "Booked elsewhere" —
      // against themselves.
      const hhmm = (t?: string | null) => (t ?? '').slice(0, 5);
      const onThisSlot = new Set(
        getBookingsBySlot(slot.id)
          .filter((b) => b.status !== 'cancelled' && b.status !== 'declined')
          .map((b) => b.artistId)
      );
      busyRows.forEach((b: any) => {
        if (!b.start_time || !b.end_time) return;
        // This exact set, for an artist who's already on it — not a conflict.
        // The date must match too: the same times on a neighbouring day are a
        // different gig elsewhere, and that one IS a conflict.
        if (
          onThisSlot.has(b.artist_id) &&
          b.date === slot.date &&
          hhmm(b.start_time) === hhmm(slot.startTime) &&
          hhmm(b.end_time) === hhmm(slot.endTime)
        ) return;
        if (timesOverlap(b.start_time, b.end_time, slot.startTime, slot.endTime, b.date, slot.date)) {
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
        if (timesOverlap(bStart, bEnd, slot.startTime, slot.endTime, bl.date, slot.date)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.id, slot?.date, slot?.venueId, currentUser?.id, isVenueLineupMode, venueAssignments, allBookings]);

  const unassignedLineupArtists = useMemo(
    () => myGlobalLineup
      .filter((entry) => !activeVenueAssignmentIds.has(entry.artistId))
      .map((entry) => ({
        entry,
        user: getArtistUser(entry.artistId),
      }))
      .filter((item) => !!item.user)
      .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? '')),
    [myGlobalLineup, activeVenueAssignmentIds, getArtistUser]
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
      title: 'New Venue',
      body: `You can now be booked at ${venueName}`,
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
          <Text style={{ color: colors.foreground }}>Slot not found</Text>
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
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Artist</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>{venueForLineup?.name ?? 'Venue'}</Text>
          </View>
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
                  ? 'No artists in your roster yet'
                  : 'All roster artists are already assigned to this venue'}
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
              </View>
              <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
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
    return { user, hasConflict: allConflicts.length > 0, conflicts: allConflicts, assignment: a };
  }).filter(Boolean) as Array<{
    user: NonNullable<ReturnType<typeof getArtistUser>>;
    hasConflict: boolean;
    conflicts: ReturnType<typeof detectConflicts>;
    assignment: typeof venueAssignmentsForSlot[0];
  }>;

  // Roster (global-lineup) artists NOT on this venue's lineup yet. The manager can
  // add them to the venue right here; once added they move up into Available /
  // Has Conflict and get assigned normally (draft, or past-confirmation request).
  const venueLineupIds = new Set(venueAssignmentsForSlot.map((a) => a.artistId));
  const notInLineup = myGlobalLineup
    .filter((entry) => !venueLineupIds.has(entry.artistId))
    .map((entry) => ({ entry, user: getArtistUser(entry.artistId) }))
    .filter((item) => !!item.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  // One unified, alphabetical list (mirrors add-slot). Each artist carries a single state that
  // drives the whole row; already-settled artists (pending/booked/completed) sink to the bottom.
  type RowState = 'available' | 'conflict' | 'drafted' | 'pending' | 'booked' | 'completed' | 'notInRoster';
  const SETTLED: RowState[] = ['pending', 'booked', 'completed'];
  const assignRows = (() => {
    const rows = djsWithConflicts.map((d) => {
      const artistId = d.user.id;
      const booking = slotBookings.find((b) => b.artistId === artistId && b.status !== 'cancelled' && b.status !== 'declined');
      let state: RowState;
      if (isPastSlot) {
        state = booking?.isCompleted ? 'completed' : booking ? 'pending' : 'available';
      } else {
        state = booking?.status === 'confirmed' ? 'booked'
          : booking ? 'pending'
          : stagedIds.has(artistId) ? 'drafted'
          : d.hasConflict ? 'conflict'
          : 'available';
      }
      return { artistId, user: d.user, conflicts: d.conflicts, state };
    });
    const roster = notInLineup.map((x) => ({ artistId: x.entry.artistId, user: x.user!, conflicts: [] as ConflictInfo[], state: 'notInRoster' as RowState }));
    return [...rows, ...roster].sort((a, b) => {
      const as = SETTLED.includes(a.state) ? 1 : 0;
      const bs = SETTLED.includes(b.state) ? 1 : 0;
      if (as !== bs) return as - bs;                 // settled last
      return (a.user.fullName ?? '').toLowerCase().localeCompare((b.user.fullName ?? '').toLowerCase());
    });
  })();

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
        { text: 'Cancel', style: 'cancel', onPress: () => {
          // Only bin the slot if nothing is riding on it. A slot with a booking or a
          // draft is real work — closing the screen must never destroy it.
          if (assignedDJIds.size === 0) deleteSlot(slot!.id);
          router.back();
        } },
        {
          text: 'Send Completed Request',
          onPress: async () => {
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
            // AWAITED on purpose. Fire-and-forget let the manager calendar's past-slot
            // sweep run first, find no booking rows for this past slot, and delete it.
            const { error: bkErr } = await supabase.from('bookings').insert({
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
              venue_type: venue?.venueType ?? null,
            });
            if (bkErr) console.warn('past booking insert error:', bkErr.message);
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: artistId,
              type: 'past_confirmation_request',
              title: 'Did You Play This Gig?',
              body: `${firstName(currentUser?.fullName, 'A manager')} says you played ${venue?.name ?? 'a venue'}, ${formatDate(slot!.date)}`,
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

  // Send a drafted artist their gig request in place (same sequence as the calendar's
  // send-drafts, via the shared persistGigRequestBooking so the booking row can't drift).
  const sendNow = async (artistId: string) => {
    if (!currentUser) return;
    if (!assignedDJIds.has(artistId)) setDraft(slot!.id, slot!.venueId, artistId, currentUser.id);
    const newBookingId = sendDraftByDJ(slot!.id, artistId, currentUser.id, addBooking);
    if (!newBookingId) return;
    await persistGigRequestBooking({
      bookingId: newBookingId, slotId: slot!.id, venueId: slot!.venueId, artistId,
      managerId: currentUser.id, slotDate: slot!.date, slotName: slot!.name,
      slotStartTime: slot!.startTime, slotEndTime: slot!.endTime,
      venueName: venue?.name ?? null, venueType: venue?.venueType ?? null,
    });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, userId: artistId,
      type: 'booking_request', title: 'New Gig Request',
      body: `${firstName(currentUser.fullName, 'A manager')} wants you at ${venue?.name ?? 'a venue'}, ${formatDate(slot!.date)}`,
      isRead: false, relatedId: newBookingId, relatedType: 'booking', createdAt: new Date().toISOString(),
    });
  };

  // "Draft" — commit the staged set: add newly-staged artists as drafts and drop any existing
  // draft the manager un-staged, then close. (Nothing was written while staging.)
  const commitDrafts = () => {
    if (!currentUser) return;
    const original = new Set(currentDrafts.map((d) => d.artistId));
    stagedIds.forEach((id) => { if (!original.has(id)) setDraft(slot!.id, slot!.venueId, id, currentUser.id); });
    original.forEach((id) => { if (!stagedIds.has(id)) removeDraftByDJ(slot!.id, id); });
    router.back();
  };

  // "Send N" — send every STAGED artist their gig request at once. Confirmed first (sending isn't
  // undoable); any existing draft the manager un-staged is dropped too, then the sheet closes.
  const confirmSendAll = () => {
    const ids = [...stagedIds];
    if (ids.length === 0) return;
    Alert.alert(
      'Send Gig Request',
      `Send a gig request to ${ids.length} artist${ids.length > 1 ? 's' : ''} for "${slot!.name}" on ${formatDate(slot!.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: async () => {
          currentDrafts.forEach((d) => { if (!stagedIds.has(d.artistId)) removeDraftByDJ(slot!.id, d.artistId); });
          for (const id of ids) { await sendNow(id); }
          router.back();
        } },
      ]
    );
  };

  const handleTapDJ = (artistId: string) => {
    if (isPastSlot) {
      handleTapDJPast(artistId);
      return;
    }
    if (!currentUser) return;
    // Future slot → just STAGE (toggle). Nothing is written until "Draft" or "Send" (footer), so
    // the manager can pick several artists and the ✕ discards them all. Booked rows aren't tappable.
    setStagedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artistId)) next.delete(artistId);
      else next.add(artistId);
      return next;
    });
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
      title: 'New Venue',
      body: `You can now be booked at ${venueName}`,
      isRead: false,
      relatedId: slot!.venueId,
      relatedType: 'venue',
      createdAt: new Date().toISOString(),
    });
  };

  const renderRow = (
    item: { artistId: string; user: any; conflicts: ConflictInfo[]; state: RowState },
    index: number,
  ) => {
    const { artistId, user, conflicts, state } = item;
    const settled = state === 'pending' || state === 'booked' || state === 'completed';
    const tappable = state === 'available' || state === 'conflict' || state === 'drafted';
    const subtitle =
      state === 'conflict' && conflicts[0] ? { text: conflicts[0].description, color: colors.error }
      : state === 'drafted' ? { text: 'Draft', color: colors.primary }
      : state === 'notInRoster' ? { text: "Not in this venue's roster", color: colors.muted }
      : null;
    return (
      <Fragment key={artistId}>
        {index > 0 ? <Divider full /> : null}
        <Pressable
          disabled={!tappable}
          style={({ pressed }) => [styles.djRow, { opacity: pressed && tappable ? 0.6 : 1 }]}
          onPress={tappable ? () => handleTapDJ(artistId) : undefined}
        >
          <AvatarImage uri={user.profilePhotoUrl || undefined} avatarId={user.avatarId} seed={user.id} name={user.fullName} size={48} />
          <View style={styles.djInfo}>
            <Text style={[styles.djName, { color: settled ? colors.muted : colors.foreground }]}>{user.fullName}</Text>
            {subtitle && <Text style={[styles.djSub, { color: subtitle.color }]} numberOfLines={2}>{subtitle.text}</Text>}
          </View>
          {state === 'notInRoster' ? (
            <Pressable
              style={({ pressed }) => [styles.addPill, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
              onPress={() => handleAddToVenueFromSlot(artistId)}
              hitSlop={6}
            >
              <MaterialIcons name="add" size={15} color={colors.primary} />
              <Text style={[styles.addPillText, { color: colors.primary }]}>Add</Text>
            </Pressable>
          ) : state === 'pending' ? (
            <Text style={[styles.trailingText, { color: colors.muted }]}>Requested</Text>
          ) : state === 'booked' ? (
            <Text style={[styles.trailingText, { color: colors.success }]}>Booked</Text>
          ) : state === 'completed' ? (
            <Text style={[styles.trailingText, { color: colors.success }]}>Completed</Text>
          ) : state === 'drafted' ? (
            <MaterialIcons name="check-circle" size={26} color={colors.primary} />
          ) : (
            <MaterialIcons name="add-circle-outline" size={26} color={colors.muted} />
          )}
        </Pressable>
      </Fragment>
    );
  };

  return (
    <View style={{ height: winH * 0.8, backgroundColor: colors.background, paddingTop: 8, overflow: 'hidden' }}>
      {/* Fixed top — header + past note stay put; only the list scrolls. */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {new Date(slot!.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {formatTime(slot!.startTime)}–{formatTime(slot!.endTime)}
          </Text>
        </View>
        {/* A plain close in the top-right — always available, even after drafting artists. */}
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <MaterialIcons name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      {isPastSlot && (
        <View style={[styles.infoNote, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
          <MaterialIcons name="history" size={14} color={colors.warning} />
          <Text style={[styles.infoNoteText, { color: colors.warning }]}>
            This slot is in the past. Tapping an artist sends them a completed gig request — they must confirm or decline it.
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listHeaderRow}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>
            {isPastSlot ? 'SEND COMPLETED GIG TO' : 'ASSIGN GIG TO'}
          </Text>
        </View>
        {assignRows.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="group" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in your roster yet</Text>
          </View>
        ) : (
          assignRows.map((item, i) => renderRow(item, i))
        )}
      </ScrollView>

      {/* Footer once artists are staged: Draft (commit) + Send, side by side. The ✕ in the header
          discards the staged selections — nothing is written until one of these is tapped. */}
      {!isPastSlot && stagedIds.size > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 56 }]}>
          <View style={styles.footerRow}>
            <Pressable
              style={({ pressed }) => [styles.sendBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={commitDrafts}
            >
              <Text style={[styles.sendBtnText, { color: colors.foreground }]}>Draft</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sendBtn, { flex: 1, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={confirmSendAll}
            >
              <Text style={styles.sendBtnText}>Send {stagedIds.size}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontFamily: fonts.bodyBold, letterSpacing: -0.4 },
  headerSub: { fontSize: 13, marginTop: 2 },
  doneBtn: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, marginTop: 4, borderRadius: 10, borderWidth: 1, padding: 10 },
  infoNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
  listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  listHeaderRow: { marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  djRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  djInfo: { flex: 1 },
  djName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  djSub: { fontSize: 12, marginTop: 2 },
  trailingText: { fontSize: 13, fontWeight: '600' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  addPillText: { fontSize: 13, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', gap: 10 },
  sendBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
