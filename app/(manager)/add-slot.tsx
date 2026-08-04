import { Fragment, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Keyboard } from '@/lib/rn';
import { Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore, useSlotStore, useAuthStore, useLineupStore, useDraftStore, useBookingStore, useNotificationStore, useAvailabilityStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { fonts } from '@/lib/fonts';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useColors } from '@/hooks/use-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { isPastStart, addDaysStr, firstName } from '@/lib/utils';
import { formatDate, detectConflicts, timesOverlap } from '@/lib/conflict-detection';
import { persistGigRequestBooking } from '@/lib/gig-requests';
import type { Slot, Booking, ConflictInfo, VenueAssignment } from '@/lib/types';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

// Next ~120 days as YYYY-MM-DD for the editable DATE dropdown (mirrors add-block's picker).
const DATE_OPTIONS: string[] = (() => {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 120; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
})();
function formatDateShort(dateStr: string) {
  if (!dateStr) return 'Select';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function AddSlotScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Header + fixed-top heights measured; only the artist list scrolls, capped at
  // window − header − fixed top − grabber. (window IS the sheet's height here, not the
  // full screen — multiplying by the 0.78 detent was double-counting and left a gap.)
  const [headerH, setHeaderH] = useState(0);
  const [topH, setTopH] = useState(0);
  const { date, venueId } = useLocalSearchParams<{ date?: string; venueId?: string }>();

  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const addSlot = useSlotStore((s) => s.addSlot);
  const updateSlot = useSlotStore((s) => s.updateSlot);
  const deleteSlot = useSlotStore((s) => s.deleteSlot);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const allDrafts = useDraftStore((s) => s.drafts);
  const setDraft = useDraftStore((s) => s.setDraft);
  const removeDraftByDJ = useDraftStore((s) => s.removeDraftByDJ);
  const sendDraftByDJ = useDraftStore((s) => s.sendDraftByDJ);
  const allBookings = useBookingStore((s) => s.bookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const blocks = useAvailabilityStore((s) => s.blocks);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const venues = allVenues.filter((v) => !v.isHidden && v.managerId === currentUser?.id);
  // Editable: seeded from the tapped/preselected date, but the manager can change the day
  // from the DATE dropdown below (the background slot is kept in sync — see the effect).
  const [targetDate, setTargetDate] = useState(date ?? new Date().toISOString().slice(0, 10));

  const [createSlotVenueId, setCreateSlotVenueId] = useState<string>(venueId ?? venues[0]?.id ?? '');
  const [slotForm, setSlotForm] = useState({ name: '', startTime: '20:00', endTime: '00:00' });
  const [dateOpen, setDateOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [createdSlotId, setCreatedSlotId] = useState<string | null>(null);
  const [footerH, setFooterH] = useState(0);

  const assignedRef = useRef(false);
  const startTimeScrollRef = useRef<ScrollView>(null);
  const endTimeScrollRef = useRef<ScrollView>(null);

  const isPast = isPastStart(targetDate, slotForm.startTime);

  // Create the slot in the background as soon as the sheet opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser || !createSlotVenueId) return;
      const { data, error } = await supabase.from('slots').insert({
        venue_id: createSlotVenueId,
        manager_id: currentUser.id,
        name: slotForm.name,
        date: targetDate,
        start_time: slotForm.startTime,
        end_time: slotForm.endTime,
        status: 'open',
      }).select().single();
      if (cancelled || error || !data) { if (error) console.warn('bg slot create:', error.message); return; }
      addSlot({
        id: data.id, venueId: createSlotVenueId, name: slotForm.name, date: targetDate,
        startTime: slotForm.startTime, endTime: slotForm.endTime, createdAt: new Date().toISOString(),
      } as Slot);
      setCreatedSlotId(data.id);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the background slot in sync when venue/date/time/name change.
  useEffect(() => {
    if (!createdSlotId) return;
    updateSlot(createdSlotId, { venueId: createSlotVenueId, name: slotForm.name, date: targetDate, startTime: slotForm.startTime, endTime: slotForm.endTime });
    supabase.from('slots').update({
      venue_id: createSlotVenueId, name: slotForm.name, date: targetDate, start_time: slotForm.startTime, end_time: slotForm.endTime,
    }).eq('id', createdSlotId).then(({ error }) => { if (error) console.warn('bg slot update:', error.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSlotVenueId, slotForm.name, targetDate, slotForm.startTime, slotForm.endTime, createdSlotId]);

  // On close without assigning anyone, delete the empty background slot.
  useEffect(() => {
    return () => {
      if (!createdSlotId) return;
      const hasDrafts = useDraftStore.getState().drafts.some((d) => d.slotId === createdSlotId);
      const hasBookings = useBookingStore.getState().bookings.some((b) => b.slotId === createdSlotId);
      if (!assignedRef.current && !hasDrafts && !hasBookings) {
        deleteSlot(createdSlotId);
        supabase.from('slots').delete().eq('id', createdSlotId).then(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdSlotId]);

  // Cross-manager conflicts: other managers' confirmed bookings (via SECURITY DEFINER RPC,
  // returns busy time-ranges only) + world-readable availability blocks, for this venue's
  // lineup artists on this date. Recomputes when venue/date/time change. Skipped for past.
  const [crossConflicts, setCrossConflicts] = useState<Map<string, ConflictInfo[]>>(new Map());
  useEffect(() => {
    if (!currentUser || isPast || !createSlotVenueId) { setCrossConflicts(new Map()); return; }
    const artistIds = venueAssignments
      .filter((a) => a.venueId === createSlotVenueId && a.status === 'active')
      .map((a) => a.artistId);
    if (artistIds.length === 0) { setCrossConflicts(new Map()); return; }
    let cancelled = false;
    // Overnight sets span two calendar days, so a clash can sit on the day either
    // side of targetDate: 1 Jun 22:00–03:00 collides with 2 Jun 01:00–04:00.
    // Fetch both neighbours and let timesOverlap decide what actually clashes.
    const dates = [addDaysStr(targetDate, -1), targetDate, addDaysStr(targetDate, 1)];
    Promise.all([
      // The RPC takes one date and its rows carry none — call it per day and tag them.
      Promise.all(
        dates.map((d) =>
          supabase
            .rpc('get_artist_busy_times', { p_artist_ids: artistIds, p_date: d })
            .then((res: any) => ((res.data ?? []) as any[]).map((row) => ({ ...row, date: d })))
        )
      ).then((perDay) => perDay.flat()),
      supabase.from('availability_blocks')
        .select('id, artist_id, date, start_time, end_time, is_full_day, block_type, event_name')
        .in('artist_id', artistIds).in('date', dates),
    ]).then(([busyRows, blocksRes]) => {
      if (cancelled) return;
      const map = new Map<string, ConflictInfo[]>();
      const add = (artistId: string, c: ConflictInfo) => { map.set(artistId, [...(map.get(artistId) ?? []), c]); };
      busyRows.forEach((b: any) => {
        if (!b.start_time || !b.end_time) return;
        if (timesOverlap(b.start_time, b.end_time, slotForm.startTime, slotForm.endTime, b.date, targetDate)) {
          add(b.artist_id, { type: 'booking', description: `Booked elsewhere ${b.start_time}–${b.end_time}`, startTime: b.start_time, endTime: b.end_time });
        }
      });
      (blocksRes.data ?? []).forEach((bl: any) => {
        const bStart = bl.is_full_day ? '00:00' : bl.start_time;
        const bEnd = bl.is_full_day ? '23:59' : bl.end_time;
        if (timesOverlap(bStart, bEnd, slotForm.startTime, slotForm.endTime, bl.date, targetDate)) {
          add(bl.artist_id, { type: 'availability_block', description: `Unavailable ${bStart}–${bEnd}`, startTime: bStart, endTime: bEnd });
        }
      });
      setCrossConflicts(map);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSlotVenueId, targetDate, slotForm.startTime, slotForm.endTime, currentUser?.id, isPast, venueAssignments]);

  const scrollToTimeOption = (ref: React.RefObject<ScrollView | null>, time: string) => {
    const idx = TIME_OPTIONS.indexOf(time);
    if (idx >= 0 && ref.current) {
      setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, idx * 36 - 72), animated: false }), 80);
    }
  };

  const headerTitle = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Working slot snapshot used for local conflict detection.
  const workingSlot: Slot = {
    id: createdSlotId ?? 'pending', venueId: createSlotVenueId, name: slotForm.name,
    date: targetDate, startTime: slotForm.startTime, endTime: slotForm.endTime, createdAt: new Date().toISOString(),
  };

  const confirmedBookings = allBookings.filter((b) => b.status === 'confirmed' || b.status === 'requested');
  const draftSlotsByDJ = (artistId: string) => allDrafts
    .filter((d) => d.artistId === artistId)
    .map((d) => {
      const s = getSlotById(d.slotId);
      if (!s) return null;
      return { slotId: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, venueName: getVenueById(s.venueId)?.name ?? 'Unknown Venue', slotName: s.name };
    })
    .filter(Boolean) as Array<{ slotId: string; date: string; startTime: string; endTime: string; venueName: string; slotName: string }>;

  const draftedIds = new Set(allDrafts.filter((d) => d.slotId === createdSlotId).map((d) => d.artistId));
  // Artists already SENT a request for this slot (draft was converted to a booking, in-place
  // or earlier). Shown as "Requested" so the manager doesn't re-draft someone they've sent.
  const bookedIds = new Set(
    allBookings.filter((b) => b.slotId === createdSlotId && (b.status === 'requested' || b.status === 'confirmed')).map((b) => b.artistId)
  );

  // Once ANY artist is drafted or requested, the venue is locked. A draft/booking snapshots the
  // venue at that moment, so switching it afterwards left the slot on one venue and the booking
  // on another (calendar showed venue A, booking-detail + dashboard showed venue B).
  const venueLocked = draftedIds.size > 0 || bookedIds.size > 0;

  // Venue lineup artists with conflict info
  const lineupWithConflicts = venueAssignments
    .filter((a) => a.venueId === createSlotVenueId && a.status === 'active')
    .map((a) => {
      const user = getArtistUser(a.artistId);
      const profile = getArtistProfile(a.artistId);
      if (!user) return null;
      const local = detectConflicts(a.artistId, workingSlot, confirmedBookings, blocks, (vid) => getVenueById(vid)?.name ?? 'Unknown Venue', getSlotById, draftSlotsByDJ(a.artistId), allBookings);
      const external = crossConflicts.get(a.artistId) ?? [];
      const conflicts = [...local, ...external];
      return { artistId: a.artistId, user, profile, hasConflict: conflicts.length > 0, conflicts };
    })
    .filter(Boolean) as Array<{ artistId: string; user: NonNullable<ReturnType<typeof getArtistUser>>; profile: ReturnType<typeof getArtistProfile>; hasConflict: boolean; conflicts: ConflictInfo[] }>;


  const myGlobalLineup = globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active');
  const venueLineupIds = new Set(venueAssignments.filter((a) => a.venueId === createSlotVenueId && a.status === 'active').map((a) => a.artistId));
  const notInLineup = myGlobalLineup
    .filter((entry) => !venueLineupIds.has(entry.artistId))
    .map((entry) => ({ artistId: entry.artistId, user: getArtistUser(entry.artistId), profile: getArtistProfile(entry.artistId) }))
    .filter((x) => !!x.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  // One unified, alphabetical list for the picker. Each artist carries a single state that
  // drives the whole row (subtitle + trailing control). Already-requested artists sink to the
  // bottom; everyone else sorts by name.
  type RowState = 'available' | 'conflict' | 'drafted' | 'requested' | 'notInRoster';
  const assignRows = (() => {
    const lineup = lineupWithConflicts.map((d) => {
      const state: RowState = bookedIds.has(d.artistId) ? 'requested'
        : draftedIds.has(d.artistId) ? 'drafted'
        : d.hasConflict ? 'conflict' : 'available';
      return { artistId: d.artistId, user: d.user, conflicts: d.conflicts, state };
    });
    const roster = notInLineup.map((x) => ({
      artistId: x.artistId, user: x.user!, conflicts: [] as ConflictInfo[], state: 'notInRoster' as RowState,
    }));
    return [...lineup, ...roster].sort((a, b) => {
      const ar = a.state === 'requested' ? 1 : 0;
      const br = b.state === 'requested' ? 1 : 0;
      if (ar !== br) return ar - br;                 // requested last
      return (a.user.fullName ?? '').localeCompare(b.user.fullName ?? '');
    });
  })();

  // Past mode: flat lineup list (send completed-gig requests), no conflicts.
  const pastLineup = venueAssignments
    .filter((a) => a.venueId === createSlotVenueId && a.status === 'active')
    .map((a) => ({ artistId: a.artistId, user: getArtistUser(a.artistId), profile: getArtistProfile(a.artistId) }))
    .filter((x) => !!x.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  const sendPastGigRequest = async (artistId: string) => {
    if (!currentUser || !createdSlotId) return;
    const venueName = venues.find((v) => v.id === createSlotVenueId)?.name;
    const now = new Date().toISOString();
    const bookingId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    const booking: Booking = {
      id: bookingId, slotId: createdSlotId, venueId: createSlotVenueId, artistId, managerId: currentUser.id,
      status: 'requested', isCompleted: false, createdAt: now, updatedAt: now,
      slotDate: targetDate, slotName: slotForm.name, slotStartTime: slotForm.startTime, slotEndTime: slotForm.endTime, venueName,
    };
    addBooking(booking);
    // AWAITED on purpose — see the delete-on-close effect and the calendar's past-slot sweep.
    const { error } = await supabase.from('bookings').insert({
      id: bookingId, slot_id: createdSlotId, venue_id: createSlotVenueId, artist_id: artistId, manager_id: currentUser.id,
      status: 'requested', is_completed: false, slot_date: targetDate, slot_name: slotForm.name,
      slot_start_time: slotForm.startTime, slot_end_time: slotForm.endTime, venue_name: venueName ?? null,
      venue_type: getVenueById(createSlotVenueId)?.venueType ?? null,
    });
    if (error) console.warn('past booking insert:', error.message);
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, userId: artistId,
      type: 'past_confirmation_request', title: 'Did You Play This Gig?', body: `${firstName(currentUser?.fullName, 'A manager')} says you played ${venueName ?? 'a venue'}, ${formatDate(targetDate)}`,
      isRead: false, relatedId: booking.id, relatedType: 'booking', createdAt: new Date().toISOString(),
    });
  };

  // Send a drafted artist their gig request right here, without going back to the calendar.
  // Draft -> booking + Supabase row + notification, the same sequence the calendar's
  // send-drafts action runs (shares persistGigRequestBooking so the row can't drift).
  const sendNow = async (artistId: string) => {
    if (!currentUser || !createdSlotId) return;
    if (!draftedIds.has(artistId)) setDraft(createdSlotId, createSlotVenueId, artistId, currentUser.id);
    assignedRef.current = true;
    const venue = venues.find((v) => v.id === createSlotVenueId);
    const newBookingId = sendDraftByDJ(createdSlotId, artistId, currentUser.id, addBooking);
    if (!newBookingId) return;
    await persistGigRequestBooking({
      bookingId: newBookingId, slotId: createdSlotId, venueId: createSlotVenueId, artistId,
      managerId: currentUser.id, slotDate: targetDate, slotName: slotForm.name,
      slotStartTime: slotForm.startTime, slotEndTime: slotForm.endTime,
      venueName: venue?.name ?? null, venueType: venue?.venueType ?? null,
    });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, userId: artistId,
      type: 'booking_request', title: 'New Gig Request',
      body: `${firstName(currentUser.fullName, 'A manager')} wants you at ${venue?.name ?? 'a venue'}, ${formatDate(targetDate)}`,
      isRead: false, relatedId: newBookingId, relatedType: 'booking', createdAt: new Date().toISOString(),
    });
  };

  // Send every drafted artist their gig request at once (footer "Send request"). Confirmed
  // first — sending is not undoable — then closes the sheet.
  const confirmSendAll = () => {
    const ids = [...draftedIds];
    if (ids.length === 0) return;
    const venueName = venues.find((v) => v.id === createSlotVenueId)?.name ?? 'this venue';
    Alert.alert(
      'Send Gig Request',
      `Send a gig request to ${ids.length} artist${ids.length > 1 ? 's' : ''} for ${venueName} on ${formatDate(targetDate)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: async () => {
          Keyboard.dismiss();
          for (const id of ids) { await sendNow(id); }
          router.back();
        } },
      ]
    );
  };

  const handleTapArtist = (artistId: string) => {
    if (!currentUser || !createdSlotId) return;
    if (isPast) {
      const name = getArtistUser(artistId)?.fullName ?? 'this artist';
      Alert.alert(
        'Past Date',
        `This date is in the past. Send ${name} a completed-gig request to confirm they played this gig?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Request', onPress: async () => {
            assignedRef.current = true;              // set FIRST: the unmount cleanup must never race this
            Keyboard.dismiss();
            await sendPastGigRequest(artistId);      // row is in Supabase before we leave
            router.back();
          } },
        ]
      );
      return;
    }
    // Tapping an already-drafted artist toggles them off; tapping a new one drafts them.
    // Either way we STAY on the screen so the manager can pick more than one artist, then
    // send in place (the row's send icon) or close the sheet to keep them as drafts to send
    // from the calendar later. (Already-requested artists are non-interactive — see render.)
    if (bookedIds.has(artistId)) return;
    if (draftedIds.has(artistId)) {
      removeDraftByDJ(createdSlotId, artistId);
      Keyboard.dismiss();
      return;
    }
    assignedRef.current = true;   // the unmount cleanup must not delete the just-created slot
    setDraft(createdSlotId, createSlotVenueId, artistId, currentUser.id);
    Keyboard.dismiss();
  };

  // Add a roster artist to this venue's lineup (stays open; they move into the assignable list).
  const handleAddToVenue = (artistId: string) => {
    if (!currentUser || !createSlotVenueId) return;
    const venueName = venues.find((v) => v.id === createSlotVenueId)?.name ?? 'this venue';
    const grEntry = myGlobalLineup.find((r) => r.artistId === artistId);
    const newAssignment: VenueAssignment = {
      id: `va-${Date.now()}`, globalLineupId: grEntry?.id ?? '', venueId: createSlotVenueId, artistId,
      assignedAt: new Date().toISOString(), status: 'active',
    };
    assignToVenue(newAssignment);
    supabase.from('venue_assignments').upsert(
      { manager_id: currentUser.id, artist_id: artistId, venue_id: createSlotVenueId, status: 'active' },
      { onConflict: 'venue_id,artist_id' }
    ).then(({ error }) => { if (error) console.warn('venue_assignment upsert error:', error.message); });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, userId: artistId,
      type: 'venue_assigned', title: 'New Venue', body: `You can now be booked at ${venueName}`,
      isRead: false, relatedId: createSlotVenueId, relatedType: 'venue', createdAt: new Date().toISOString(),
    });
  };

  const renderRow = (
    item: { artistId: string; user: any; conflicts: ConflictInfo[]; state: RowState },
    index: number,
  ) => {
    const { artistId, user, conflicts, state } = item;
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
          style={({ pressed }) => [styles.artistRow, { opacity: pressed && tappable ? 0.6 : 1 }]}
          onPress={tappable ? () => handleTapArtist(artistId) : undefined}
        >
          <AvatarImage uri={user.profilePhotoUrl || undefined} avatarId={(user as any).avatarId} seed={user.id} name={user.fullName} size={42} variant="artist" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.artistName, { color: state === 'requested' ? colors.muted : colors.foreground }]}>{user.fullName}</Text>
            {subtitle && <Text style={[styles.artistSub, { color: subtitle.color }]} numberOfLines={2}>{subtitle.text}</Text>}
          </View>
          {state === 'requested' ? (
            <Text style={[styles.requestedText, { color: colors.muted }]}>Requested</Text>
          ) : state === 'notInRoster' ? (
            <Pressable
              style={({ pressed }) => [styles.addPill, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
              onPress={() => handleAddToVenue(artistId)}
              hitSlop={6}
            >
              <MaterialIcons name="add" size={15} color={colors.primary} />
              <Text style={[styles.addPillText, { color: colors.primary }]}>Add</Text>
            </Pressable>
          ) : state === 'drafted' ? (
            <MaterialIcons name="check-circle" size={26} color={colors.primary} />
          ) : (
            <MaterialIcons name="add-circle-outline" size={26} color={colors.muted} />
          )}
        </Pressable>
      </Fragment>
    );
  };

  const renderPastRow = (item: { artistId: string; user: any }, index: number) => (
    <Fragment key={item.artistId}>
      {index > 0 ? <Divider full /> : null}
      <Pressable
        style={({ pressed }) => [styles.artistRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => handleTapArtist(item.artistId)}
      >
        <AvatarImage uri={item.user.profilePhotoUrl || undefined} avatarId={(item.user as any).avatarId} seed={item.user.id} name={item.user.fullName} size={42} variant="artist" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.artistName, { color: colors.foreground }]}>{item.user.fullName}</Text>
        </View>
        <MaterialIcons name="send" size={20} color={colors.muted} />
      </Pressable>
    </Fragment>
  );

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, height: Dimensions.get('window').height }]}>
      <View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{headerTitle}</Text>
        <Pressable onPress={() => { Keyboard.dismiss(); router.back(); }} hitSlop={8}>
          <Text style={[styles.doneBtn, { color: colors.primary }]}>Done</Text>
        </Pressable>
      </View>

      {/* Fixed top — venue + time pickers stay on screen; only the artist list scrolls. */}
      <View onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>
            VENUE{venueLocked ? '  ·  LOCKED (artist assigned)' : ''}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillRow}>
            {venues.map((v) => {
              const sel = createSlotVenueId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => { if (!venueLocked) setCreateSlotVenueId(v.id); }}
                  disabled={venueLocked}
                  style={[styles.venuePill, { backgroundColor: sel ? colors.primary : 'transparent', borderColor: sel ? colors.primary : colors.border, opacity: venueLocked && !sel ? 0.35 : 1 }]}
                >
                  {venueLocked && sel && <MaterialIcons name="lock" size={11} color="#fff" />}
                  <Text style={[styles.venuePillText, { color: sel ? '#fff' : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.fieldBlock, { zIndex: dateOpen ? 30 : 1 }]}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>DATE</Text>
          <View style={{ position: 'relative', zIndex: dateOpen ? 30 : 1 }}>
            <Pressable
              style={[styles.timeDropdownBtn, { borderColor: dateOpen ? colors.primary : colors.border }]}
              onPress={() => { Keyboard.dismiss(); setDateOpen(!dateOpen); setStartTimeOpen(false); setEndTimeOpen(false); }}
            >
              <MaterialIcons name="event" size={14} color={dateOpen ? colors.primary : colors.muted} />
              <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{formatDateShort(targetDate)}</Text>
              <MaterialIcons name={dateOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
            </Pressable>
            {dateOpen && (
              <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <ScrollView style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {DATE_OPTIONS.map((d) => {
                    const isSelected = targetDate === d;
                    return (
                      <Pressable key={d} style={[styles.timeOption, isSelected && { backgroundColor: colors.primary + '15' }]} onPress={() => { setTargetDate(d); setDateOpen(false); }}>
                        <Text style={[styles.timeOptionText, { color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '700' : '400' }]}>{formatDateShort(d)}</Text>
                        {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>


        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>START</Text>
            <View style={{ position: 'relative', zIndex: startTimeOpen ? 20 : 1 }}>
              <Pressable
                style={[styles.timeDropdownBtn, { borderColor: startTimeOpen ? colors.primary : colors.border }]}
                onPress={() => { Keyboard.dismiss(); setStartTimeOpen(!startTimeOpen); setEndTimeOpen(false); }}
              >
                <MaterialIcons name="access-time" size={14} color={startTimeOpen ? colors.primary : colors.muted} />
                <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{slotForm.startTime}</Text>
                <MaterialIcons name={startTimeOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
              </Pressable>
              {startTimeOpen && (
                <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ScrollView ref={startTimeScrollRef} onLayout={() => scrollToTimeOption(startTimeScrollRef, slotForm.startTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {TIME_OPTIONS.map((t) => {
                      const isSelected = slotForm.startTime === t;
                      return (
                        <Pressable key={t} style={[styles.timeOption, isSelected && { backgroundColor: colors.primary + '15' }]} onPress={() => { setSlotForm((f) => ({ ...f, startTime: t })); setStartTimeOpen(false); }}>
                          <Text style={[styles.timeOptionText, { color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '700' : '400' }]}>{t}</Text>
                          {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <View style={styles.timeSep}>
            <MaterialIcons name="arrow-forward" size={16} color={colors.muted} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>END</Text>
            <View style={{ position: 'relative', zIndex: endTimeOpen ? 20 : 1 }}>
              <Pressable
                style={[styles.timeDropdownBtn, { borderColor: endTimeOpen ? colors.primary : colors.border }]}
                onPress={() => { Keyboard.dismiss(); setEndTimeOpen(!endTimeOpen); setStartTimeOpen(false); }}
              >
                <MaterialIcons name="access-time" size={14} color={endTimeOpen ? colors.primary : colors.muted} />
                <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{slotForm.endTime}</Text>
                <MaterialIcons name={endTimeOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
              </Pressable>
              {endTimeOpen && (
                <View style={[styles.timeDropdownList, styles.timeDropdownAbsolute, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ScrollView ref={endTimeScrollRef} onLayout={() => scrollToTimeOption(endTimeScrollRef, slotForm.endTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {TIME_OPTIONS.map((t) => {
                      const isSelected = slotForm.endTime === t;
                      return (
                        <Pressable key={t} style={[styles.timeOption, isSelected && { backgroundColor: colors.primary + '15' }]} onPress={() => { setSlotForm((f) => ({ ...f, endTime: t })); setEndTimeOpen(false); }}>
                          <Text style={[styles.timeOptionText, { color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '700' : '400' }]}>{t}</Text>
                          {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Only the artist list scrolls. Bounded height because flex:1 doesn't bound a
          ScrollView inside the native formSheet (its onLayout reports content height). */}
      <ScrollView
        style={[{ backgroundColor: colors.background }, headerH && topH ? { maxHeight: Dimensions.get('window').height - headerH - topH - 30 } : { flex: 1 }]}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 + (!isPast && draftedIds.size > 0 ? footerH : 0) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isPast ? (
          <>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>SEND COMPLETED GIG TO</Text>
            </View>
            {pastLineup.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in this venue's roster yet.</Text>
            ) : (
              pastLineup.map((item, i) => renderPastRow(item, i))
            )}
          </>
        ) : (
          <>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>ASSIGN GIG TO</Text>
            </View>
            {assignRows.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in this venue's roster yet.</Text>
            ) : (
              assignRows.map((item, i) => renderRow(item, i))
            )}
          </>
        )}
        <View style={{ flexGrow: 1, minHeight: 200, backgroundColor: colors.background }} />
      </ScrollView>

      {/* Footer — send all drafts at once. Absolute so the list scrolls behind it. */}
      {!isPast && draftedIds.size > 0 && (
        <View
          style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.footerCount, { color: colors.foreground }]}>{draftedIds.size} draft{draftedIds.size > 1 ? 's' : ''}</Text>
            <Text style={[styles.footerHint, { color: colors.muted }]}>Stays on your calendar</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            onPress={confirmSendAll}
          >
            <MaterialIcons name="send" size={16} color="#fff" />
            <Text style={styles.sendBtnText}>Send request</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 13, paddingTop: 8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 12 },
  sheetTitle: { fontSize: 20, fontFamily: fonts.bodyBold, letterSpacing: -0.4, marginBottom: 1 },
  doneBtn: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6, paddingRight: 4, alignItems: 'center' },
  venuePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, minHeight: 34 },
  venuePillText: { fontSize: 12, fontWeight: '600', includeFontPadding: false },
  timeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  timeSep: { paddingTop: 28 },
  timeDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 },
  timeDropdownText: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  timeDropdownAbsolute: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 },
  timeDropdownList: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  timeDropdownScroll: { maxHeight: 160 },
  timeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  timeOptionText: { fontSize: 14 },
  listHeaderRow: { marginTop: 8, marginBottom: 6 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  artistName: { fontSize: 15, fontWeight: '700' },
  artistSub: { fontSize: 12, marginTop: 2 },
  requestedText: { fontSize: 13, fontWeight: '600' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  addPillText: { fontSize: 13, fontWeight: '700' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerCount: { fontSize: 15, fontWeight: '700' },
  footerHint: { fontSize: 12, marginTop: 1 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
