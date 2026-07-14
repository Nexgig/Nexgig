import { Fragment, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Keyboard } from '@/lib/rn';
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
import { isPastStart, performerLabel } from '@/lib/utils';
import { formatDate, detectConflicts, timesOverlap } from '@/lib/conflict-detection';
import type { Slot, Booking, ConflictInfo, VenueAssignment } from '@/lib/types';

const SLOT_PRESETS = [
  { name: 'Day', start: '13:00', end: '17:00' },
  { name: 'Sunset', start: '17:00', end: '21:00' },
  { name: 'Night', start: '21:00', end: '01:00' },
] as const;

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

export default function AddSlotScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
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
  const allBookings = useBookingStore((s) => s.bookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const blocks = useAvailabilityStore((s) => s.blocks);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const venues = allVenues.filter((v) => !v.isHidden && v.managerId === currentUser?.id);
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const [createSlotVenueId, setCreateSlotVenueId] = useState<string>(venueId ?? venues[0]?.id ?? '');
  const [slotForm, setSlotForm] = useState({ name: '', startTime: '20:00', endTime: '00:00' });
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [createdSlotId, setCreatedSlotId] = useState<string | null>(null);

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

  // Keep the background slot in sync when venue/time/name change.
  useEffect(() => {
    if (!createdSlotId) return;
    updateSlot(createdSlotId, { venueId: createSlotVenueId, name: slotForm.name, startTime: slotForm.startTime, endTime: slotForm.endTime });
    supabase.from('slots').update({
      venue_id: createSlotVenueId, name: slotForm.name, start_time: slotForm.startTime, end_time: slotForm.endTime,
    }).eq('id', createdSlotId).then(({ error }) => { if (error) console.warn('bg slot update:', error.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSlotVenueId, slotForm.name, slotForm.startTime, slotForm.endTime, createdSlotId]);

  // On close without assigning anyone, delete the empty background slot.
  useEffect(() => {
    return () => {
      if (!createdSlotId) return;
      const hasDrafts = useDraftStore.getState().drafts.some((d) => d.slotId === createdSlotId);
      if (!assignedRef.current && !hasDrafts) {
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
    Promise.all([
      supabase.rpc('get_artist_busy_times', { p_artist_ids: artistIds, p_date: targetDate }),
      supabase.from('availability_blocks')
        .select('id, artist_id, start_time, end_time, is_full_day, block_type, event_name')
        .in('artist_id', artistIds).eq('date', targetDate),
    ]).then(([busyRes, blocksRes]) => {
      if (cancelled) return;
      const map = new Map<string, ConflictInfo[]>();
      const add = (artistId: string, c: ConflictInfo) => { map.set(artistId, [...(map.get(artistId) ?? []), c]); };
      (busyRes.data ?? []).forEach((b: any) => {
        if (!b.start_time || !b.end_time) return;
        if (timesOverlap(b.start_time, b.end_time, slotForm.startTime, slotForm.endTime, targetDate, targetDate)) {
          add(b.artist_id, { type: 'booking', description: `Booked elsewhere ${b.start_time}–${b.end_time}`, startTime: b.start_time, endTime: b.end_time });
        }
      });
      (blocksRes.data ?? []).forEach((bl: any) => {
        const bStart = bl.is_full_day ? '00:00' : bl.start_time;
        const bEnd = bl.is_full_day ? '23:59' : bl.end_time;
        if (timesOverlap(bStart, bEnd, slotForm.startTime, slotForm.endTime, targetDate, targetDate)) {
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

  const available = lineupWithConflicts.filter((d) => !d.hasConflict).sort((a, b) => (a.user.fullName ?? '').localeCompare(b.user.fullName ?? ''));
  const withConflict = lineupWithConflicts.filter((d) => d.hasConflict).sort((a, b) => (a.user.fullName ?? '').localeCompare(b.user.fullName ?? ''));

  const myGlobalLineup = globalLineup.filter((r) => r.managerId === currentUser?.id && r.status === 'active');
  const venueLineupIds = new Set(venueAssignments.filter((a) => a.venueId === createSlotVenueId && a.status === 'active').map((a) => a.artistId));
  const notInLineup = myGlobalLineup
    .filter((entry) => !venueLineupIds.has(entry.artistId))
    .map((entry) => ({ artistId: entry.artistId, user: getArtistUser(entry.artistId), profile: getArtistProfile(entry.artistId) }))
    .filter((x) => !!x.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  // Past mode: flat lineup list (send completed-gig requests), no conflicts.
  const pastLineup = venueAssignments
    .filter((a) => a.venueId === createSlotVenueId && a.status === 'active')
    .map((a) => ({ artistId: a.artistId, user: getArtistUser(a.artistId), profile: getArtistProfile(a.artistId) }))
    .filter((x) => !!x.user)
    .sort((a, b) => (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''));

  const sendPastGigRequest = (artistId: string) => {
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
    supabase.from('bookings').insert({
      id: bookingId, slot_id: createdSlotId, venue_id: createSlotVenueId, artist_id: artistId, manager_id: currentUser.id,
      status: 'requested', is_completed: false, slot_date: targetDate, slot_name: slotForm.name,
      slot_start_time: slotForm.startTime, slot_end_time: slotForm.endTime, venue_name: venueName ?? null,
      venue_type: getVenueById(createSlotVenueId)?.venueType ?? null,
    }).then(({ error }) => { if (error) console.warn('past booking insert:', error.message); });
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, userId: artistId,
      type: 'past_confirmation_request', title: 'Confirm Past Gig', body: `${venueName ?? 'a venue'} — ${formatDate(targetDate)}`,
      isRead: false, relatedId: booking.id, relatedType: 'booking', createdAt: new Date().toISOString(),
    });
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
          { text: 'Send Request', onPress: () => { sendPastGigRequest(artistId); assignedRef.current = true; Keyboard.dismiss(); router.back(); } },
        ]
      );
      return;
    }
    // Toggle, and stay open so the manager can draft several artists onto the slot.
    if (draftedIds.has(artistId)) {
      removeDraftByDJ(createdSlotId, artistId);
    } else {
      setDraft(createdSlotId, createSlotVenueId, artistId, currentUser.id);
    }
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
      type: 'venue_assigned', title: 'Assigned to Venue', body: `${venueName}`,
      isRead: false, relatedId: createSlotVenueId, relatedType: 'venue', createdAt: new Date().toISOString(),
    });
  };

  const StatusPill = ({ tone, icon, label }: { tone: string; icon: any; label: string }) => (
    <View style={[styles.statusPill, { backgroundColor: tone + '20' }]}>
      <MaterialIcons name={icon} size={11} color={tone} />
      <Text style={[styles.statusPillText, { color: tone }]}>{label}</Text>
    </View>
  );

  const renderAssignRow = (item: { artistId: string; user: any; profile: any; hasConflict?: boolean; conflicts?: ConflictInfo[] }, index = 0) => {
    const drafted = !isPast && draftedIds.has(item.artistId);
    // Card-free: no tint, no state border. Drafted reads from the trailing coral
    // check-circle; a conflict reads from the inline red banner below the name.
    return (
      <Fragment key={item.artistId}>
        {index > 0 ? <Divider full /> : null}
      <Pressable
        style={({ pressed }) => [styles.artistRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => handleTapArtist(item.artistId)}
      >
        <AvatarImage uri={item.user.profilePhotoUrl || undefined} avatarId={(item.user as any).avatarId} seed={item.user.id} name={item.user.fullName} size={42} variant="artist" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.artistName, { color: colors.foreground }]}>{item.user.fullName}</Text>
          <Text style={[styles.artistSub, { color: colors.muted }]}>{performerLabel(item.profile?.instruments)}</Text>
          {item.hasConflict && item.conflicts && item.conflicts[0] && (
            <View style={styles.conflictBanner}>
              <MaterialIcons name="warning" size={12} color={colors.error} />
              <Text style={[styles.conflictText, { color: colors.error }]} numberOfLines={2}>{item.conflicts[0].description}</Text>
            </View>
          )}
        </View>
        {isPast ? (
          <StatusPill tone={colors.warning} icon="history" label="Past gig" />
        ) : item.hasConflict ? (
          <StatusPill tone={colors.warning} icon="warning" label="Conflict" />
        ) : (
          <StatusPill tone={colors.success} icon="check-circle" label="Available" />
        )}
        <MaterialIcons name={drafted ? 'check-circle' : (isPast ? 'send' : 'add-circle-outline')} size={20} color={drafted ? colors.primary : colors.muted} />
      </Pressable>
      </Fragment>
    );
  };

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, flex: 1 }]}>
      <View style={styles.header}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{headerTitle}</Text>
        <Pressable
          style={[styles.closeBtn, { borderWidth: 1, borderColor: colors.border }]}
          onPress={() => { Keyboard.dismiss(); router.back(); }}
          hitSlop={8}
        >
          <MaterialIcons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>VENUE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillRow}>
            {venues.map((v) => {
              const sel = createSlotVenueId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setCreateSlotVenueId(v.id)}
                  style={[styles.venuePill, { backgroundColor: sel ? colors.primary : 'transparent', borderColor: sel ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.venuePillText, { color: sel ? '#fff' : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>TIME PRESETS</Text>
          <View style={styles.presetRow}>
            {SLOT_PRESETS.map((preset) => (
              <Pressable
                key={preset.name}
                onPress={() => setSlotForm((f) => ({ ...f, name: preset.name, startTime: preset.start, endTime: preset.end }))}
                style={({ pressed }) => [styles.presetChip, {
                  backgroundColor: slotForm.name === preset.name ? colors.primary + '18' : 'transparent',
                  borderColor: slotForm.name === preset.name ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={[styles.presetChipText, { color: slotForm.name === preset.name ? colors.primary : colors.foreground, fontWeight: slotForm.name === preset.name ? '700' : '500' }]}>{preset.name}</Text>
              </Pressable>
            ))}
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

        {isPast ? (
          <>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>SEND COMPLETED GIG TO</Text>
            </View>
            {pastLineup.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in this venue's lineup yet.</Text>
            ) : (
              pastLineup.map((item, i) => renderAssignRow(item, i))
            )}
          </>
        ) : (
          <>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>ASSIGN GIG TO</Text>
            </View>

            {available.length === 0 && withConflict.length === 0 && notInLineup.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in this venue's lineup yet.</Text>
            ) : null}

            {[...available, ...withConflict].map((item, i) => renderAssignRow(item, i))}

            {notInLineup.length > 0 && (
              <>
                {notInLineup.map((item, i) => (
                  <Fragment key={item.artistId}>
                  {(i > 0 || available.length > 0 || withConflict.length > 0) ? <Divider full /> : null}
                  <View style={styles.artistRow}>
                    <AvatarImage uri={item.user!.profilePhotoUrl || undefined} avatarId={(item.user as any).avatarId} seed={item.user!.id} name={item.user!.fullName} size={42} variant="artist" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.artistName, { color: colors.foreground }]}>{item.user!.fullName}</Text>
                      <Text style={[styles.artistSub, { color: colors.muted }]}>{performerLabel(item.profile?.instruments)}</Text>
                    </View>
                    <StatusPill tone={colors.muted} icon="group-add" label="Not in lineup" />
                    <Pressable
                      style={({ pressed }) => [styles.addPill, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
                      onPress={() => handleAddToVenue(item.artistId)}
                      hitSlop={6}
                    >
                      <MaterialIcons name="add" size={15} color={colors.primary} />
                      <Text style={[styles.addPillText, { color: colors.primary }]}>Add</Text>
                    </Pressable>
                  </View>
                  </Fragment>
                ))}
              </>
            )}

            {available.length === 0 && withConflict.length === 0 && notInLineup.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No artists in this venue's lineup yet.</Text>
            )}
          </>
        )}
        <View style={{ flexGrow: 1, minHeight: 200, backgroundColor: colors.background }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 13, paddingTop: 8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 12 },
  sheetTitle: { fontSize: 20, fontFamily: fonts.bodyBold, letterSpacing: -0.4, marginBottom: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6, paddingRight: 4, alignItems: 'center' },
  venuePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, minHeight: 34 },
  venuePillText: { fontSize: 12, fontWeight: '600', includeFontPadding: false },
  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  presetChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, minHeight: 30, justifyContent: 'center', alignItems: 'center' },
  presetChipText: { fontSize: 12, includeFontPadding: false },
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
  artistSub: { fontSize: 12, marginTop: 1 },
  conflictBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 3 },
  conflictText: { fontSize: 12, flex: 1, lineHeight: 16 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  addPillText: { fontSize: 13, fontWeight: '700' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
});
