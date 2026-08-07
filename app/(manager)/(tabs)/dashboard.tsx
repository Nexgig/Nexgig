import { sweepExpiredRequests } from '@/lib/expire-requests';
import { useRoleSwitching } from '@/lib/roles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from '@/lib/rn';
import { LayoutAnimation, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { VenueFilterHeader } from '@/components/venue-filter-header';
import { MaterialIcons } from '@expo/vector-icons';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { fonts } from '@/lib/fonts';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, useNotificationStore, useInvoiceStore, useVenueFilterStore, useDraftStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { useFormatTime } from '@/lib/conflict-detection';
import { isPastEnd, nowLocalDateTimeStr, bookingVenueName, todayLocalStr, addDaysStr } from '@/lib/utils';
import { ensureScheduleSlots } from '@/lib/venue-schedule-sync';

export default function ManagerDashboard() {
  const router = useRouter();
  const colors = useColors();
  // Drops the RefreshControl during a role switch — unmounting one with the group
  // crashes natively. See useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const artistUsers = useLineupStore((s) => s.artistUsers);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  // Fill the next few weeks from each venue's programme so the Overview coverage strip
  // reflects it (materialize-on-view; idempotent). The calendar fills whole months.
  const scheduleSig = useMemo(() => JSON.stringify(venues.map((v) => [v.id, v.schedule ?? []])), [venues]);
  useEffect(() => {
    const today = todayLocalStr();
    ensureScheduleSlots(today, addDaysStr(today, 20));
  }, [scheduleSig]);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.managerId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  // Booking ids that appear in a non-cancelled invoice → "Invoiced" chip.
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const invoicedBookingIds = useMemo(() => new Set(
    allInvoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
  ), [allInvoices, currentUser?.id]);

  const nowDT = nowLocalDateTimeStr();

  // Combined list for the "Bookings" section: pending + confirmed + completed,
  // ALL dates. Resolves slot/venue/dj with snapshot fallback, tags each with a
  // display status + dot color, and sorts active (pending/confirmed) first by
  // soonest date, then completed by most-recent.
  const dashboardBookings = useMemo(() => bookings
    .filter((b) =>
      b.status === 'requested' || b.status === 'past_confirmation' ||
      b.status === 'confirmed' || b.status === 'completed' || b.isCompleted)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      const dj = b.artistId == null
        ? { fullName: 'Former Artist', profilePhotoUrl: undefined }
        : artistUsers.find((u) => u.id === b.artistId);
      const venue = allVenues.find((v) => v.id === b.venueId);
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId, venueId: b.venueId, date: b.slotDate,
        name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
        endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
      } : undefined);
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
      const isDone = b.status === 'completed' || b.isCompleted;
      const isPending = b.status === 'requested' || b.status === 'past_confirmation';
      const statusKey = isDone ? 'completed' : isPending ? 'pending' : 'confirmed';
      const dotColor = isDone ? STATUS_COLORS.completed : isPending ? STATUS_COLORS.pending : STATUS_COLORS.confirmed;
      const isInvoiced = invoicedBookingIds.has(b.id);
      return { ...b, slot: resolvedSlot, dj, venue: resolvedVenue, statusKey, dotColor, isDone, isInvoiced };
    })
    .sort((a, b) => {
      // Active (pending/confirmed) above completed.
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? '';
      const db = b.slot?.date ?? '';
      // Active: soonest first (ascending). Completed: most-recent first (descending).
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    }),
    [bookings, slots, artistUsers, allVenues, invoicedBookingIds]
  );

  // Shared venue filter — the header title (VenueFilterHeader) sets it; dashboard, calendar
  // and roster all read this one.
  const bookingVenueId = useVenueFilterStore((s) => s.venueId);

  // Coverage strip: manager's venues (rows) × the next 7 nights (columns). Each cell shows the
  // strongest state among that venue's slots that night. "Needs you" = a slot with no booking
  // (empty OR draft-only) — it wants the manager's action, so it outranks Sent/Booked.
  // Priority: cancelled > needs-you > sent > booked > none.
  const drafts = useDraftStore((s) => s.drafts);
  const coverage = useMemo(() => {
    const start = todayLocalStr();
    const nights = Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
    const stripVenues = bookingVenueId ? venues.filter((v) => v.id === bookingVenueId) : venues;
    const bySlot = new Map<string, typeof bookings>();
    for (const b of bookings) {
      if (!b.slotId || b.hiddenFromManagerCalendar) continue;
      const arr = bySlot.get(b.slotId);
      if (arr) arr.push(b); else bySlot.set(b.slotId, [b]);
    }
    const draftSlotIds = new Set(drafts.map((d) => d.slotId));
    const rows = stripVenues.map((v) => ({
      venue: v,
      // Priority (strongest wins): cancelled > empty > drafted > sent > booked.
      cells: nights.map((date) => {
        const daySlots = slots.filter((s) => s.venueId === v.id && s.date === date);
        let cancelled = false, drafted = false, empty = false, sent = false, booked = false;
        for (const s of daySlots) {
          const bs = bySlot.get(s.id) ?? [];               // non-hidden manager bookings for this slot
          if (bs.length === 0) {                            // no booking → drafted or empty
            if (draftSlotIds.has(s.id)) drafted = true; else empty = true;
            continue;
          }
          if (bs.some((b) => b.status === 'cancelled' || b.status === 'declined')) cancelled = true;
          if (bs.some((b) => b.status === 'requested' || b.status === 'past_confirmation')) sent = true;
          if (bs.some((b) => b.status === 'confirmed')) booked = true;
        }
        return cancelled ? 'cancelled' : empty ? 'empty' : drafted ? 'drafted' : sent ? 'sent' : booked ? 'booked' : 'none';
      }),
    }));
    return { nights, rows };
  }, [venues, slots, bookings, drafts, bookingVenueId]);

  // Tapping a coverage square expands an inline panel directly beneath that venue's row (no
  // modal, no navigation): the date, its slot count, and each gig as time · artist · status.
  // Tapping another square swaps the panel in place — moving it to the new row if the venue
  // differs; tapping the same square closes it. Expand/collapse animates via LayoutAnimation.
  const [selected, setSelected] = useState<{ venueId: string; date: string } | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const toggleDay = (venueId: string, date: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelected((cur) => (cur && cur.venueId === venueId && cur.date === date) ? null : { venueId, date });
  };

  // The selected night's date label ("Wed 12 August") and its slot count, for the panel header.
  const panelDateLabel = useMemo(() => {
    if (!selected) return '';
    const d = new Date(selected.date + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
  }, [selected]);
  const panelSlotCount = useMemo(
    () => selected ? slots.filter((s) => s.venueId === selected.venueId && s.date === selected.date).length : 0,
    [selected, slots]
  );
  // Slot-based, mirroring the calendar day list: for the selected venue+night, each slot shows its
  // bookings, its drafts, or a "Needs artist" row when empty — so an empty (coral-dashed) square
  // still lists its slot rather than reading as "nothing".
  const panelItems = useMemo(() => {
    if (!selected) return [];
    const SHOWN = new Set(['requested', 'past_confirmation', 'confirmed', 'completed', 'cancelled', 'declined', 'expired']);
    const daySlots = slots
      .filter((s) => s.venueId === selected.venueId && s.date === selected.date)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    type Item = { key: string; kind: 'booking' | 'draft' | 'empty'; slot: typeof daySlots[number]; booking?: (typeof bookings)[number]; dj?: any; artistId?: string };
    const items: Item[] = [];
    for (const slot of daySlots) {
      const bs = bookings.filter((b) => b.slotId === slot.id && !b.hiddenFromManagerCalendar && (SHOWN.has(b.status) || b.isCompleted));
      const bookedIds = new Set(bs.map((b) => b.artistId));
      const slotDrafts = drafts.filter((d) => d.slotId === slot.id && !bookedIds.has(d.artistId));
      if (bs.length === 0 && slotDrafts.length === 0) {
        items.push({ key: 'empty-' + slot.id, kind: 'empty', slot });
        continue;
      }
      bs.forEach((b) => {
        const dj = b.artistId == null ? { fullName: 'Former Artist', profilePhotoUrl: undefined } : artistUsers.find((u) => u.id === b.artistId);
        items.push({ key: b.id, kind: 'booking', slot, booking: b, dj });
      });
      slotDrafts.forEach((d) => {
        items.push({ key: 'draft-' + slot.id + '-' + d.artistId, kind: 'draft', slot, dj: artistUsers.find((u) => u.id === d.artistId), artistId: d.artistId });
      });
    }
    return items;
  }, [selected, slots, bookings, drafts, artistUsers]);

  // Group bookings by slot so a slot with several artists shows as ONE row
  // (stacked avatars + joined names). Status dot uses the highest-priority
  // status among the slot's artists: pending > confirmed > completed.
  const groupedBookingsPreview = useMemo(() => {
    // Bookings list shows only confirmed (Booked) gigs — pending shows in the Overview strip
    // (amber) and the day sheet; completed live on the Completed page.
    const active = dashboardBookings.filter((b) => b.statusKey === 'confirmed');
    const venueScoped = bookingVenueId
      ? active.filter((b) => b.venueId === bookingVenueId)
      : active;
    const groups = new Map<string, typeof dashboardBookings>();
    const order: string[] = [];
    for (const b of venueScoped) {
      const key = b.slotId ?? b.id;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(b);
    }
    const rank: Record<string, number> = { pending: 0, confirmed: 1, completed: 2 };
    const dotFor: Record<string, string> = { pending: STATUS_COLORS.pending, confirmed: STATUS_COLORS.confirmed, completed: STATUS_COLORS.completed };
    return order.map((key) => {
      const items = groups.get(key)!;
      const first = items[0];
      const statusKey = items.reduce((acc, it) => (rank[it.statusKey] < rank[acc] ? it.statusKey : acc), first.statusKey);
      return {
        key,
        first,
        djs: items.map((it) => it.dj),
        dotColor: dotFor[statusKey],
        isInvoiced: items.some((it) => it.isInvoiced),
        count: items.length,
      };
    });
  }, [dashboardBookings, bookingVenueId]);

  // Group the slot-groups by DATE for the dashboard list — a date header ("FRI 31 JUL") with a
  // per-day gig count, then the gigs under it. groupedBookingsPreview is already date-sorted.
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, typeof groupedBookingsPreview>();
    const order: string[] = [];
    for (const g of groupedBookingsPreview) {
      const d = g.first.slot?.date ?? g.first.slotDate ?? '';
      if (!map.has(d)) { map.set(d, []); order.push(d); }
      map.get(d)!.push(g);
    }
    return order.map((d) => ({ date: d, gigs: map.get(d)! }));
  }, [groupedBookingsPreview]);


  const formatDateHeader = (dateStr: string) => {
    if (!dateStr) return '';
    const today = todayLocalStr();
    if (dateStr === today) return 'TODAY';
    if (dateStr === addDaysStr(today, 1)) return 'TOMORROW';
    const d = new Date(dateStr + 'T00:00:00');
    const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${wd} ${d.getDate()} ${mon}`;
  };

  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const hideFromManagerCalendar = useBookingStore((s) => s.hideFromManagerCalendar);
  const [refreshing, setRefreshing] = useState(false);

  // Dismiss a cancelled/declined/expired booking straight from the inline panel — same effect as
  // the calendar's X: hide it from the manager (and from the artist too if the artist cancelled).
  // Animate so the row collapses out of the panel.
  const dismissBooking = (b: (typeof bookings)[number]) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hideFromManagerCalendar(b.id);
    const syncFields: any = { hiddenFromManagerCalendar: true };
    if (b.cancelledByArtist) syncFields.hiddenFromCalendar = true;
    syncBookingStatus(b.id, b.status as any, syncFields);
  };

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    const { data } = await supabase.from('bookings').select('*').eq('manager_id', currentUser.id);
    if (data) {
      clearBookings();
      data.forEach((b: any) => addBooking({
        id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
        managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
        confirmedAt: b.confirmed_at ?? undefined, cancelledAt: b.cancelled_at ?? undefined,
        cancellationReason: b.cancellation_reason ?? undefined,
        cancellationAcknowledged: b.cancellation_acknowledged ?? false,
        cancelledAsRequest: b.cancelled_as_request ?? false,
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
        venueName: b.venue_name ?? undefined, venueType: b.venue_type ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    setRefreshing(false);
  }, [currentUser?.id]);

  // Auto-complete confirmed bookings whose slot END time has passed.
  // End, not start: a gig isn't done when it begins, and completion is what triggers
  // the review flow. isPastEnd handles the midnight cross (20:00–00:00 ends next day).
  // Retire requests nobody answered before the gig ended. Runs on both sides — the
  // write is idempotent, so whichever app opens first does it.
  useEffect(() => { sweepExpiredRequests(); }, [nowDT]);

  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        // Use live slot first, fall back to booking's own snapshot
        const slotDate = slot?.date ?? b.slotDate;
        const slotStart = slot?.startTime ?? b.slotStartTime;
        const slotEnd = slot?.endTime ?? b.slotEndTime;
        if (slotDate && slotStart && isPastEnd(slotDate, slotStart, slotEnd)) {
          const venue = allVenues.find((v) => v.id === b.venueId);
          updateBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: slot?.date ?? b.slotDate,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: slot?.startTime ?? b.slotStartTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
          syncBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: slot?.date ?? b.slotDate,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: slot?.startTime ?? b.slotStartTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
        }
      });
  }, [bookings, slots, nowDT, updateBookingStatus, allVenues]);

  const renderDateGroup = ({ date, gigs }: { date: string; gigs: typeof groupedBookingsPreview }) => (
    <View key={date}>
      <View style={styles.dateHeader}>
        {(() => {
          const label = formatDateHeader(date);
          const isSoon = label === 'TODAY' || label === 'TOMORROW';
          return <Text style={[styles.dateHeaderLabel, { color: isSoon ? colors.foreground : colors.muted }]}>{label}</Text>;
        })()}
        <View style={[styles.dateHeaderLine, { backgroundColor: colors.border }]} />
      </View>
      {gigs.map((g) => {
        const names = g.djs.map((d) => d?.fullName ?? 'Unknown Artist');
        const title = g.count === 1
          ? names[0]
          : `${names.slice(0, 2).join(', ')}${g.count > 2 ? ` +${g.count - 2}` : ''}`;
        // Only pending shows a label; confirmed shows nothing (just the time).
        const isPending = g.dotColor === STATUS_COLORS.pending;
        return (
          <Pressable
            key={g.key}
            style={({ pressed }) => [styles.gigRow, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(manager)/booking-detail?id=' + g.first.id) as Href)}
          >
            <View style={styles.avatarStack}>
              {g.djs.slice(0, 2).map((d, i) => (
                <View key={i} style={[styles.avatarRing, { borderColor: colors.background, marginLeft: i === 0 ? 0 : -18, zIndex: g.djs.length - i }]}>
                  <AvatarImage uri={d?.profilePhotoUrl || undefined} avatarId={(d as any)?.avatarId} seed={(d as any)?.id} name={d?.fullName} size={44} />
                </View>
              ))}
            </View>
            <View style={styles.gigInfo}>
              <View style={styles.gigNameRow}>
                <Text style={[styles.gigName, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
                {isPending && <StatusBadge status="pending" />}
              </View>
              <Text style={[styles.gigVenue, { color: colors.muted }]} numberOfLines={1}>{bookingVenueName(g.first, g.first.venue?.name)}</Text>
            </View>
            <View style={styles.gigRight}>
              <Text style={[styles.gigTime, { color: colors.muted }]}>
                {g.first.slot ? `${fmtTime(g.first.slot.startTime)}–${fmtTime(g.first.slot.endTime)}` : ''}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ScreenContainer>
      {/* Frozen header — stays fixed while the content below scrolls. */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <VenueFilterHeader />
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.notifBtn}
            onPress={() => router.push('/(manager)/notifications' as Href)}
          >
            <MaterialIcons name="notifications" size={22} color={colors.foreground} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Coverage strip — venues (down) × the next 7 nights (across). Sits where the stat
            row used to. STATUS_COLORS, not theme tokens: same statuses as the badges below. */}
        <View style={styles.strip}>
          <View style={styles.overviewHead}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Overview</Text>
            <Pressable hitSlop={10} onPress={() => setShowLegend(true)} style={styles.overviewInfo}>
              <MaterialIcons name="info-outline" size={18} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.stripRow}>
            <View style={styles.stripVenueCol} />
            {coverage.nights.map((date) => (
              <View key={date} style={styles.stripCell}>
                <Text style={[styles.stripDow, { color: colors.muted }]}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                </Text>
              </View>
            ))}
          </View>
          {coverage.rows.map((r) => (
            <View key={r.venue.id}>
              <View style={styles.stripRow}>
                <Pressable
                  style={({ pressed }) => [styles.stripVenueCol, { opacity: pressed ? 0.5 : 1 }]}
                  onPress={() => router.push(('/(manager)/venue-detail?id=' + r.venue.id) as Href)}
                >
                  <Text style={[styles.stripVenueName, { color: colors.muted }]} numberOfLines={1}>{r.venue.name}</Text>
                </Pressable>
                {r.cells.map((state, i) => {
                  const isSel = selected?.venueId === r.venue.id && selected?.date === coverage.nights[i];
                  return (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [styles.stripCell, { opacity: pressed ? 0.5 : 1 }]}
                      onPress={() => toggleDay(r.venue.id, coverage.nights[i])}
                    >
                      {/* Ring wrapper: when selected it insets the square by a 2px background gap and
                          draws a 2px coral ring around it, without changing the cell's footprint. */}
                      <View style={[styles.cellRingWrap, isSel && { padding: 2, borderWidth: 2, borderColor: colors.primary, borderRadius: 14 }]}>
                        <View
                          style={[
                            styles.cellBox,
                            state === 'cancelled' ? { backgroundColor: colors.cancelled }
                              : state === 'empty' ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed' }   // beige + coral dashed — empty slot, needs attention
                              : state === 'drafted' ? { backgroundColor: colors.surface }   // beige fill — artist drafted, not sent yet
                              : state === 'sent' ? { backgroundColor: STATUS_COLORS.pending }
                              : state === 'booked' ? { backgroundColor: STATUS_COLORS.confirmed }
                              : { backgroundColor: colors.background },   // no slot at all — blends into the page
                          ]}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Inline panel — expands directly beneath the selected venue's row. Read-only peek:
                  date, slot count, and each gig as time · artist · status badge. */}
              {selected?.venueId === r.venue.id && (
                <View style={[styles.inlinePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.inlinePanelHead}>
                    <Text style={[styles.inlinePanelDate, { color: colors.foreground }]}>{panelDateLabel}</Text>
                    <Text style={[styles.inlinePanelCount, { color: colors.muted }]}>{panelSlotCount} slot{panelSlotCount === 1 ? '' : 's'}</Text>
                  </View>
                  <View style={[styles.inlinePanelDivider, { backgroundColor: colors.border }]} />
                  {panelItems.length === 0 ? (
                    <Text style={[styles.inlinePanelEmpty, { color: colors.muted }]}>No slots on this night.</Text>
                  ) : (
                    panelItems.map((item) => {
                      // Empty / draft → assign-artist for that slot; booking (any status, incl.
                      // cancelled) → the booking detail. Dead bookings also get an X to dismiss.
                      const b = item.booking;
                      const dead = item.kind === 'booking' && (b!.status === 'cancelled' || b!.status === 'declined' || b!.status === 'expired');
                      const onPress = () => router.push((item.kind === 'booking'
                        ? '/(manager)/booking-detail?id=' + b!.id
                        : '/(manager)/assign-artist?slotId=' + item.slot.id) as Href);
                      return (
                        <Pressable
                          key={item.key}
                          onPress={onPress}
                          style={({ pressed }) => [styles.inlineRow, { opacity: pressed ? 0.6 : 1 }]}
                        >
                          <Text style={[styles.inlineTime, { color: colors.muted }]} numberOfLines={1}>{fmtTime(item.slot.startTime)}</Text>
                          <Text
                            style={[styles.inlineName, { color: item.kind === 'empty' ? colors.primary : colors.foreground }]}
                            numberOfLines={1}
                          >
                            {item.kind === 'empty' ? 'Needs artist' : (item.dj?.fullName ?? 'Unknown Artist')}
                          </Text>
                          <View style={styles.inlineRight}>
                            {item.kind !== 'empty' && (
                              <StatusBadge status={item.kind === 'draft' ? 'draft' : (b!.status as any)} />
                            )}
                            {dead && (
                              <Pressable hitSlop={8} onPress={() => dismissBooking(b!)} style={styles.inlineDismiss}>
                                <MaterialIcons name="close" size={18} color={colors.muted} />
                              </Pressable>
                            )}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
        <View style={[styles.sectionBreak, { backgroundColor: colors.surface }]} />

        {/* Bookings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bookings</Text>
          {groupedBookingsPreview.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
            </View>
          ) : (
            <View>
            {bookingsByDate.map(renderDateGroup)}
            </View>
          )}
        </View>


      </ScrollView>

      {/* Legend popover — opened from the (i) next to Overview. Tap anywhere to dismiss. */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={styles.legendBackdrop} onPress={() => setShowLegend(false)}>
          <View style={[styles.legendCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.legendCardTitle, { color: colors.foreground }]}>What the colors mean</Text>
            {[
              { label: 'Unfilled', swatch: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed' as const } },
              { label: 'Draft', swatch: { backgroundColor: colors.surface } },
              { label: 'Sent', swatch: { backgroundColor: STATUS_COLORS.pending } },
              { label: 'Booked', swatch: { backgroundColor: STATUS_COLORS.confirmed } },
              { label: 'Cancelled', swatch: { backgroundColor: colors.cancelled } },
            ].map((row) => (
              <View key={row.label} style={styles.legendCardRow}>
                <View style={[styles.legendSwatch, row.swatch]} />
                <Text style={[styles.legendCardText, { color: colors.foreground }]}>{row.label}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerLeft: {},
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E2674A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  section: { marginTop: 0 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  sectionBreak: { height: 8, marginHorizontal: -20, marginTop: 8, marginBottom: 20 },
  overviewHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  overviewInfo: { padding: 2 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  legendCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 18, minWidth: 220, gap: 12 },
  legendCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  legendCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendCardText: { fontSize: 14 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  // Bookings — date-grouped rows with a status bar + stacked avatars
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 8 },
  dateHeaderLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dateHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginLeft: 12 },
  gigRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { borderRadius: 24, borderWidth: 2 },
  strip: { marginBottom: 4 },
  stripRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stripVenueCol: { width: 92, paddingRight: 8 },
  stripVenueName: { fontSize: 15, fontWeight: '600' },
  stripDow: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  stripCell: { flex: 1, paddingHorizontal: 3 },
  cellRingWrap: { width: '100%' },
  cellBox: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  gigNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  gigName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  gigVenue: { fontSize: 13 },
  gigRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  gigTime: { fontSize: 13, fontWeight: '500' },
  gigInfo: { flex: 1 },
  // Inline panel (expands beneath the selected Overview row)
  inlinePanel: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, marginBottom: 12 },
  inlinePanelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlinePanelDate: { fontSize: 16, fontFamily: fonts.bodyBold, letterSpacing: -0.3 },
  inlinePanelCount: { fontSize: 13, fontWeight: '600' },
  inlinePanelDivider: { height: StyleSheet.hairlineWidth, marginTop: 10, marginBottom: 4 },
  inlinePanelEmpty: { fontSize: 14, paddingVertical: 10 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  inlineTime: { fontSize: 13, fontWeight: '600', width: 66 },
  inlineName: { fontSize: 15, fontWeight: '600', flex: 1 },
  inlineRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineDismiss: { padding: 2 },
});
