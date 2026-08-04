import { sweepExpiredRequests } from '@/lib/expire-requests';
import { useRoleSwitching } from '@/lib/roles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from '@/lib/rn';
import { useWindowDimensions, Animated } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { VenueFilterHeader } from '@/components/venue-filter-header';
import { Divider } from '@/components/ui/card-free';
import { MaterialIcons } from '@expo/vector-icons';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useLineupStore, useNotificationStore, useInvoiceStore, useVenueFilterStore, useDraftStore } from '@/lib/store';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { useFormatTime } from '@/lib/conflict-detection';
import { isPastEnd, nowLocalDateTimeStr, bookingVenueName, todayLocalStr, addDaysStr } from '@/lib/utils';

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
  // strongest state among that venue's slots that night: booked (a confirmed booking) > pending
  // (a request out, or an artist drafted) > open (a slot with nobody on it) > empty (no slot).
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
      cells: nights.map((date) => {
        const daySlots = slots.filter((s) => s.venueId === v.id && s.date === date);
        let cancelled = false, confirmed = false, pending = false;
        for (const s of daySlots) {
          const bs = bySlot.get(s.id) ?? [];               // non-hidden manager bookings for this slot
          if (bs.some((b) => b.status === 'cancelled')) cancelled = true;
          const active = bs.filter(
            (b) => b.status === 'confirmed' || b.status === 'requested' || b.status === 'past_confirmation'
          );
          if (active.some((b) => b.status === 'confirmed')) confirmed = true;
          if (active.some((b) => b.status !== 'confirmed')) pending = true;
          if (active.length === 0 && draftSlotIds.has(s.id)) pending = true;
        }
        // Priority: cancelled needs attention first, then pending, then confirmed.
        return cancelled ? 'cancelled' : pending ? 'pending' : confirmed ? 'booked' : 'empty';
      }),
    }));
    return { nights, rows };
  }, [venues, slots, bookings, drafts, bookingVenueId]);

  // Tapping a coverage square opens a bottom sheet of that day's bookings, scoped to whatever
  // the venue filter is: All Venues → every venue's bookings that day; one venue → just that one.
  // Each square is a (venue, night); the sheet shows just that venue's bookings that night.
  const [sheetTarget, setSheetTarget] = useState<{ venueId: string; name: string; date: string } | null>(null);
  const { height: winH } = useWindowDimensions();
  const panelH = winH * 0.53;
  // Slide + mount lifecycle. `renderTarget` keeps the panel mounted (and its content stable) while
  // it slides down to close; `sheetTarget` is the open target — tapping another square just changes
  // it, so the content swaps in place with no re-animation.
  const sheetY = useRef(new Animated.Value(panelH)).current;
  const [renderTarget, setRenderTarget] = useState<{ venueId: string; name: string; date: string } | null>(null);
  useEffect(() => {
    if (sheetTarget) {
      setRenderTarget(sheetTarget);
      Animated.timing(sheetY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    } else if (renderTarget) {
      Animated.timing(sheetY, { toValue: panelH, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setRenderTarget(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetTarget]);
  // The sheet resolves from the raw bookings (NOT dashboardBookings, which drops cancelled/declined)
  // so cancelled rows appear here and can be dismissed. Hidden (already-dismissed) ones stay out.
  const sheetBookings = useMemo(() => {
    if (!renderTarget) return [];
    const SHOWN = new Set(['requested', 'past_confirmation', 'confirmed', 'completed', 'cancelled', 'declined', 'expired']);
    return bookings
      .filter((b) => b.venueId === renderTarget.venueId && !b.hiddenFromManagerCalendar && (SHOWN.has(b.status) || b.isCompleted))
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const dj = b.artistId == null
          ? { fullName: 'Former Artist', profilePhotoUrl: undefined as string | undefined }
          : artistUsers.find((u) => u.id === b.artistId);
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId, venueId: b.venueId, date: b.slotDate,
          name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
        } : undefined);
        return { ...b, slot: resolvedSlot, dj };
      })
      .filter((b) => (b.slot?.date ?? b.slotDate) === renderTarget.date)
      .sort((a, b) => (a.slot?.startTime ?? a.slotStartTime ?? '').localeCompare(b.slot?.startTime ?? b.slotStartTime ?? ''));
  }, [renderTarget, bookings, slots, artistUsers]);
  // Dismiss a cancelled/declined/expired booking straight from the sheet — same effect as the
  // calendar's X: hide it from the manager (and from the artist too if the artist cancelled).
  const dismissSheetBooking = (b: (typeof sheetBookings)[number]) => {
    hideFromManagerCalendar(b.id);
    const syncFields: any = { hiddenFromManagerCalendar: true };
    if (b.cancelledByArtist) syncFields.hiddenFromCalendar = true;
    syncBookingStatus(b.id, b.status as any, syncFields);
  };

  // Group bookings by slot so a slot with several artists shows as ONE row
  // (stacked avatars + joined names). Status dot uses the highest-priority
  // status among the slot's artists: pending > confirmed > completed.
  const groupedBookingsPreview = useMemo(() => {
    // Dashboard shows only live bookings — completed ones live on the Completed page.
    const active = dashboardBookings.filter((b) => !b.isDone);
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

  // First section = the next 7 days, shown inline. After that, group by calendar month:
  // the current month's leftovers read "Later in August", each following month by its name
  // ("September", and "January 2027" once the year rolls over).
  const { inlineGroups, monthBuckets } = useMemo(() => {
    const today = todayLocalStr();
    const inlineEnd = addDaysStr(today, 7);          // exclusive — today + the next 6 days
    const currentMonthKey = today.slice(0, 7);       // "YYYY-MM"
    const currentYear = today.slice(0, 4);
    const inline: typeof bookingsByDate = [];
    const byMonth = new Map<string, typeof bookingsByDate>();
    const order: string[] = [];
    for (const grp of bookingsByDate) {
      if (!grp.date || grp.date < inlineEnd) { inline.push(grp); continue; }
      const mk = grp.date.slice(0, 7);
      if (!byMonth.has(mk)) { byMonth.set(mk, []); order.push(mk); }
      byMonth.get(mk)!.push(grp);
    }
    const buckets = order.map((mk) => {
      const groups = byMonth.get(mk)!;
      const [y, m] = mk.split('-').map(Number);
      const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      const label = mk === currentMonthKey
        ? `Later in ${monthName}`
        : (mk.slice(0, 4) === currentYear ? monthName : `${monthName} ${y}`);
      return { key: mk, label, groups, count: groups.reduce((n, g) => n + g.gigs.length, 0) };
    });
    return { inlineGroups: inline, monthBuckets: buckets };
  }, [bookingsByDate]);

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
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

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
                {isPending && <Text style={[styles.gigStatus, { color: STATUS_COLORS.pending }]}>PENDING</Text>}
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

  const renderCollapsible = (
    label: string,
    groups: typeof bookingsByDate,
    count: number,
    expanded: boolean,
    onToggle: () => void,
  ) => (
    <View key={label}>
      <View style={styles.laterDivider}><Divider full /></View>
      <Pressable
        style={({ pressed }) => [styles.laterRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={onToggle}
      >
        <View style={styles.laterLeft}>
          <Text style={[styles.laterLabel, { color: colors.foreground }]}>{label}</Text>
          <View style={[styles.laterCountPill, { backgroundColor: colors.surface }]}>
            <Text style={[styles.laterCountText, { color: colors.muted }]}>{count}</Text>
          </View>
        </View>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-down' : 'keyboard-arrow-right'}
          size={24}
          color={colors.muted}
        />
      </Pressable>
      {expanded && groups.map(renderDateGroup)}
    </View>
  );

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
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

        {/* Coverage strip — venues (down) × the next 7 nights (across). Sits where the stat
            row used to. STATUS_COLORS, not theme tokens: same statuses as the badges below. */}
        <View style={styles.strip}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 16 }]}>Overview</Text>
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
            <View key={r.venue.id} style={styles.stripRow}>
              <View style={styles.stripVenueCol}>
                <Text style={[styles.stripVenueName, { color: colors.muted }]} numberOfLines={1}>{r.venue.name}</Text>
              </View>
              {r.cells.map((state, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.stripCell, { opacity: pressed ? 0.5 : 1 }]}
                  onPress={() => setSheetTarget({ venueId: r.venue.id, name: r.venue.name, date: coverage.nights[i] })}
                >
                  <View
                    style={[
                      styles.cellBox,
                      state === 'cancelled' ? { backgroundColor: colors.error }
                        : state === 'booked' ? { backgroundColor: STATUS_COLORS.confirmed }
                        : state === 'pending' ? { backgroundColor: STATUS_COLORS.pending }
                        : { backgroundColor: colors.surface },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          ))}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: STATUS_COLORS.confirmed }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Booked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: STATUS_COLORS.pending }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Pending</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.error }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>Cancelled</Text>
            </View>
          </View>
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
            {inlineGroups.map(renderDateGroup)}
            {monthBuckets.map((b) => renderCollapsible(
              b.label, b.groups, b.count,
              !!expandedMonths[b.key],
              () => setExpandedMonths((m) => ({ ...m, [b.key]: !m[b.key] })),
            ))}
            </View>
          )}
        </View>


      </ScrollView>

      {/* Day sheet — a custom in-app panel (no backdrop) so the Overview squares stay tappable:
          tap another square to SWAP the day in place. Snaps in/out (no slide yet). Lists that
          day's bookings, scoped to the venue filter (All Venues → all; one venue → that one). */}
      {renderTarget && (
        <Animated.View style={[styles.sheetPanel, { backgroundColor: colors.background, borderTopColor: colors.border, height: panelH, transform: [{ translateY: sheetY }] }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {new Date(renderTarget.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>{renderTarget.name}</Text>
            </View>
            <Pressable hitSlop={10} style={styles.sheetClose} onPress={() => setSheetTarget(null)}>
              <MaterialIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {sheetBookings.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <MaterialIcons name="event-busy" size={28} color={colors.muted} />
                <Text style={[styles.sheetEmptyText, { color: colors.muted }]}>No bookings this day</Text>
              </View>
            ) : (
              sheetBookings.map((b) => {
                const time = b.slot ? `${fmtTime(b.slot.startTime)}–${fmtTime(b.slot.endTime)}` : '';
                const dismissable = b.status === 'cancelled' || b.status === 'declined' || b.status === 'expired';
                return (
                  <View key={b.id} style={styles.sheetRow}>
                    <Pressable
                      style={({ pressed }) => [styles.sheetRowMain, { opacity: pressed ? 0.7 : 1 }]}
                      onPress={() => { setSheetTarget(null); router.push(('/(manager)/booking-detail?id=' + b.id) as Href); }}
                    >
                      <AvatarImage uri={b.dj?.profilePhotoUrl || undefined} avatarId={(b.dj as any)?.avatarId} seed={(b.dj as any)?.id} name={b.dj?.fullName} size={40} />
                      <View style={styles.sheetRowInfo}>
                        <View style={styles.gigNameRow}>
                          <Text style={[styles.sheetRowName, { color: colors.foreground }]} numberOfLines={1}>{b.dj?.fullName ?? 'Unknown Artist'}</Text>
                          <StatusBadge status={b.status as any} />
                        </View>
                        <Text style={[styles.sheetRowSub, { color: colors.muted }]} numberOfLines={1}>{time}</Text>
                      </View>
                    </Pressable>
                    {dismissable && (
                      <Pressable hitSlop={8} style={styles.sheetDismiss} onPress={() => dismissSheetBooking(b)}>
                        <MaterialIcons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      )}

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerLeft: {},
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E2674A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  section: { marginTop: 0 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  sectionBreak: { height: 8, marginHorizontal: -20, marginTop: 8, marginBottom: 20 },
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
  cellBox: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendText: { fontSize: 12 },
  gigNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  gigName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  gigVenue: { fontSize: 13 },
  gigRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  gigStatus: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  gigTime: { fontSize: 13, fontWeight: '500' },
  gigInfo: { flex: 1 },
  // Day sheet (Overview square tap)
  sheetPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, elevation: 24,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  sheetHeaderText: { flex: 1 },
  sheetClose: { padding: 2 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sheetSubtitle: { fontSize: 13, marginTop: 2 },
  sheetScroll: { flex: 1 },
  sheetEmpty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  sheetEmptyText: { fontSize: 14 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  sheetRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetDismiss: { padding: 6, marginLeft: 8 },
  sheetRowInfo: { flex: 1 },
  sheetRowName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  sheetRowSub: { fontSize: 13, marginTop: 1 },
  laterDivider: { marginTop: 12 },
  laterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18 },
  laterLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  laterLabel: { fontSize: 16, fontWeight: '700' },
  laterCountPill: { minWidth: 26, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, alignItems: 'center' },
  laterCountText: { fontSize: 13, fontWeight: '700' },
});
