import { sweepExpiredRequests } from '@/lib/expire-requests';
import { useRoleSwitching } from '@/lib/roles';
import { useMemo, useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Modal, Image, Alert, Linking } from '@/lib/rn';
import { LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { fonts } from '@/lib/fonts';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useNotificationStore, useInvoiceStore } from '@/lib/store';
import { STATUS_COLORS } from '@/components/ui/date-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/lib/supabase';
import { syncBookingStatus } from '@/lib/booking-sync';
import { fetchPrivateEventBookings } from '@/lib/private-events';
import { venueImageFor } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { isPastEnd, isExpiredRequest, displayStatus, firstName, nowLocalDateTimeStr, bookingVenueName, todayLocalStr, addDaysStr } from '@/lib/utils';

// Statuses the Overview panel and per-day strip consider "real" gigs for this artist.
const PANEL_STATUSES = new Set(['requested', 'past_confirmation', 'confirmed', 'completed', 'cancelled', 'declined']);

export default function DJHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  // Drops the RefreshControl during a role switch — unmounting one with the group
  // crashes natively. See useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromCalendar = useBookingStore((s) => s.hideFromCalendar);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const allInvoices = useInvoiceStore((s) => s.invoices);

  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    // clearBookings() wipes private events too — they live in availability_blocks, NOT
    // the bookings table, so this fetch can't bring them back. Rebuild them alongside.
    const [bookingsRes, privateBookings] = await Promise.all([
      supabase.from('bookings').select('*').eq('artist_id', currentUser.id),
      fetchPrivateEventBookings(currentUser.id),
    ]);
    const data = bookingsRes.data;
    if (data) {
      clearBookings();
      data.forEach((b: any) => addBooking({
        id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
        managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
        confirmedAt: b.confirmed_at ?? undefined, cancelledAt: b.cancelled_at ?? undefined,
        cancellationReason: b.cancellation_reason ?? undefined,
        cancellationAcknowledged: b.cancellation_acknowledged ?? false,
        cancelledAsRequest: b.cancelled_as_request ?? false,
        cancelledByArtist: b.cancelled_by_artist ?? undefined,
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
        isArtistCreated: b.is_artist_created ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined, price: b.price ?? undefined,
        venueName: b.venue_name ?? undefined, venueType: b.venue_type ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    privateBookings.forEach((bk) => addBooking(bk));
    setRefreshing(false);
  }, [currentUser?.id]);

  const bookings = useMemo(
    () => allBookings.filter((b) => b.artistId === currentUser?.id),
    [allBookings, currentUser?.id]
  );

  const nowDT = nowLocalDateTimeStr();

  // Retire requests nobody answered before the gig ended. Runs on both sides — the
  // write is idempotent, so whichever app opens first does it.
  useEffect(() => { sweepExpiredRequests(); }, [nowDT]);

  // Auto-complete confirmed bookings whose END time has passed. End, not start: a gig
  // isn't done when it begins, and completion is what triggers the review flow. isPastEnd
  // handles the midnight cross. The artist store lacks the manager's slots, so fall back
  // to the snapshot fields saved on the booking itself.
  useEffect(() => {
    bookings
      .filter((b) => b.status === 'confirmed' && !b.isCompleted && !b.isArtistCreated)
      .forEach((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const date = slot?.date ?? b.slotDate;
        const startTime = slot?.startTime ?? b.slotStartTime;
        const endTime = slot?.endTime ?? b.slotEndTime;
        if (date && startTime && isPastEnd(date, startTime, endTime)) {
          const venue = allVenues.find((v) => v.id === b.venueId);
          updateBookingStatus(b.id, 'completed', {
            isCompleted: true,
            slotDate: date,
            slotName: slot?.name ?? b.slotName,
            slotStartTime: startTime,
            slotEndTime: slot?.endTime ?? b.slotEndTime,
            venueName: venue?.name ?? b.venueName,
          });
        }
      });
  }, [bookings, slots, nowDT, updateBookingStatus, allVenues]);

  // Date of a booking, preferring the live slot then the snapshot saved on the booking.
  const dateOf = useCallback(
    (b: (typeof bookings)[number]) => slots.find((s) => s.id === b.slotId)?.date ?? b.slotDate ?? '',
    [slots]
  );

  // Combined "Bookings" list: confirmed + pending + completed, ALL dates.
  // Resolves slot/venue with snapshot fallback, handles artist-created private events,
  // tags each with a status + dot color, sorts active first (soonest), completed most-recent.
  const dashboardBookings = useMemo(() => {
    const invoicedIds = new Set(
      allInvoices
        .filter((inv) => inv.artistId === currentUser?.id && inv.status !== 'cancelled')
        .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
    );
    const mapped = bookings
      .filter((b) =>
        b.status === 'requested' || b.status === 'past_confirmation' ||
        b.status === 'confirmed' || b.status === 'completed' || b.isCompleted)
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
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
        return { ...b, slot: resolvedSlot, venue: resolvedVenue, statusKey, dotColor, isDone, isInvoiced: invoicedIds.has(b.id) };
      });
    return mapped.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const da = a.slot?.date ?? a.slotDate ?? '';
      const db = b.slot?.date ?? b.slotDate ?? '';
      if (!a.isDone) return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    });
  }, [bookings, slots, allVenues, allInvoices, currentUser?.id]);

  // Bookings list — BOOKED (confirmed) gigs only, grouped by date under a header
  // ("TODAY" / "TOMORROW" / "FRI 14 AUG"). Pending requests live in "Needs your reply".
  const bookingsByDate = useMemo(() => {
    const active = dashboardBookings.filter((b) => b.statusKey === 'confirmed');
    const map = new Map<string, typeof active>();
    const order: string[] = [];
    for (const b of active) {
      const d = b.slot?.date ?? b.slotDate ?? '';
      if (!map.has(d)) { map.set(d, []); order.push(d); }
      map.get(d)!.push(b);
    }
    return order.map((d) => ({ date: d, gigs: map.get(d)! }));
  }, [dashboardBookings]);

  // THIS MONTH is the headline card — split into EARNED (completed) + BOOKED (confirmed upcoming).
  // "Past bookings" (pastMonths) below lists COMPLETED gigs by month, INCLUDING the current one.
  const curMonthKey = todayLocalStr().slice(0, 7);
  const curYear = curMonthKey.slice(0, 4);
  const thisMonthLabel = new Date(curMonthKey + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  const thisMonth = useMemo(() => {
    let earned = 0, booked = 0, gigs = 0;
    for (const b of dashboardBookings) {
      const date = b.slot?.date ?? b.slotDate ?? '';
      if (!date || date.slice(0, 7) !== curMonthKey) continue;
      const price = b.price ?? 0;
      if (b.isDone) { earned += price; gigs++; }
      else if (b.statusKey === 'confirmed') { booked += price; gigs++; }
    }
    return { earned, booked, total: earned + booked, gigs };
  }, [dashboardBookings, curMonthKey]);
  // Whether the artist has any completed gigs — gates the "Past bookings" link at the bottom.
  // The month-grouped earnings history now lives on its own page (app/(artist)/past-bookings.tsx).
  const hasPastBookings = useMemo(() => dashboardBookings.some((b) => b.isDone), [dashboardBookings]);
  const [earningsOpen, setEarningsOpen] = useState(false);   // whole Earnings section — collapsed by default
  const toggleEarnings = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEarningsOpen((v) => !v);
  };

  // ── Overview strip: the artist's own schedule across the next 31 nights ───────────────
  // One row of days, each colored by that day's winning status (pending > booked > cancelled).
  // Completed gigs are NOT colored on the strip (only the color goes away — the booking still
  // shows in the panel and Bookings list). Numbers sit inside the squares (manager single-venue
  // look). Tapping a day expands an inline panel below the strip listing that day's gigs.
  const stripDays = useMemo(() => {
    const start = todayLocalStr();
    const nights = Array.from({ length: 31 }, (_, i) => addDaysStr(start, i));
    const rank = { cancelled: 0, booked: 1, pending: 2 } as const;
    const winner = new Map<string, 'pending' | 'booked' | 'cancelled'>();
    for (const b of bookings) {
      // hiddenFromCalendar = artist dismissed it; cancelledAsRequest = manager withdrew a request
      // the artist never answered (a silent withdrawal, hidden like on the calendar).
      if (b.hiddenFromCalendar || b.cancelledAsRequest) continue;
      const date = dateOf(b);
      if (!date) continue;
      let s: 'pending' | 'booked' | 'cancelled' | null = null;
      if ((b.status === 'requested' || b.status === 'past_confirmation') &&
          !isExpiredRequest(b.status, b.createdAt, date, b.slotStartTime, b.slotEndTime)) s = 'pending';
      else if (b.status === 'confirmed' && !b.isCompleted) s = 'booked';
      else if (b.status === 'cancelled' || b.status === 'declined') s = 'cancelled';
      // completed / isCompleted → no color (the day reads as free)
      if (!s) continue;
      const cur = winner.get(date);
      if (!cur || rank[s] > rank[cur]) winner.set(date, s);
    }
    return nights.map((date) => ({ date, state: winner.get(date) ?? ('none' as const) }));
  }, [bookings, dateOf]);

  const [selected, setSelected] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  // Measured width of the day strip → size each day column to an even fraction so a WHOLE number of
  // days fills it (no partial next-day cell peeking on the right). Falls back to 44 before measuring.
  const [stripW, setStripW] = useState(0);
  const dayW = stripW > 0 ? stripW / Math.max(1, Math.round(stripW / 44)) : 44;
  const toggleDay = (date: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelected((cur) => (cur === date ? null : date));
  };

  const panelDateLabel = useMemo(() => {
    if (!selected) return '';
    const d = new Date(selected + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
  }, [selected]);

  const panelGigs = useMemo(() => {
    if (!selected) return [];
    return bookings
      .filter((b) => !b.hiddenFromCalendar && !b.cancelledAsRequest && dateOf(b) === selected && (PANEL_STATUSES.has(b.status) || b.isCompleted))
      .map((b) => ({
        id: b.id,
        startTime: slots.find((s) => s.id === b.slotId)?.startTime ?? b.slotStartTime ?? '',
        name: b.isArtistCreated ? (b.slotName ?? 'Private Booking') : bookingVenueName(b, allVenues.find((v) => v.id === b.venueId)?.name),
        shown: displayStatus(b.status, b.createdAt, selected, b.slotStartTime, b.slotEndTime),
        dismissable: b.status === 'cancelled' || b.status === 'declined',
        status: b.status,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [selected, bookings, slots, allVenues, dateOf]);

  // Dismiss a cancelled/declined booking from the strip + panel — mirrors the artist calendar's
  // Dismiss (hide it from the artist's calendar + acknowledge the cancellation so it stops surfacing).
  const dismissCancelled = (id: string, status: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hideFromCalendar(id);
    updateBookingStatus(id, status as any, { cancellationAcknowledged: true });
    syncBookingStatus(id, status as any, { hiddenFromCalendar: true, cancellationAcknowledged: true });
  };

  // ── "Needs your reply": live requests awaiting the artist's confirm/decline ───────────
  const needsReply = useMemo(() => bookings
    .filter((b) => !b.isArtistCreated && !b.hiddenFromCalendar
      && (b.status === 'requested' || b.status === 'past_confirmation')
      && !isExpiredRequest(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime))
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      const venue = allVenues.find((v) => v.id === b.venueId) ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
      return {
        ...b,
        venue,
        resolvedDate: slot?.date ?? b.slotDate,
        resolvedStart: slot?.startTime ?? b.slotStartTime,
        resolvedEnd: slot?.endTime ?? b.slotEndTime,
        resolvedVenueName: venue?.name ?? b.venueName ?? 'Unknown Venue',
        resolvedVenueType: venue?.venueType ?? b.venueType ?? '',
      };
    })
    .sort((a, b) => (a.resolvedDate ?? '') < (b.resolvedDate ?? '') ? -1 : 1),
    [bookings, slots, allVenues]
  );

  // ── "Cancelled": a manager cancelled a gig the artist had — surfaced here (+ a notification)
  // instead of on the calendar. Only unacknowledged MANAGER cancellations (not the artist's own,
  // and not a withdrawn request, which auto-acknowledges). "Got it" clears it everywhere. ──────
  const cancelledHeadsUp = useMemo(() => bookings
    .filter((b) => !b.isArtistCreated && !b.hiddenFromCalendar && !b.cancelledAsRequest
      && b.status === 'cancelled' && !b.cancellationAcknowledged && !b.cancelledByArtist)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      const venue = allVenues.find((v) => v.id === b.venueId) ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
      return {
        ...b,
        venue,
        resolvedDate: slot?.date ?? b.slotDate,
        resolvedStart: slot?.startTime ?? b.slotStartTime,
        resolvedEnd: slot?.endTime ?? b.slotEndTime,
        resolvedVenueName: venue?.name ?? b.venueName ?? 'Unknown Venue',
        resolvedVenueType: venue?.venueType ?? b.venueType ?? '',
      };
    })
    .sort((a, b) => (a.cancelledAt ?? '') < (b.cancelledAt ?? '') ? 1 : -1),
    [bookings, slots, allVenues]
  );

  // Confirm/decline logic — mirrors app/(artist)/pending-requests.tsx so the inline cards
  // behave identically to that screen.
  const notifyManager = (managerId: string, type: 'booking_confirmed' | 'booking_declined', bookingId: string, venueName: string, date: string) => {
    const artistName = currentUser?.fullName ?? 'The artist';
    const titles = { booking_confirmed: 'Booked', booking_declined: 'Declined' } as const;
    const verbs = { booking_confirmed: 'accepted', booking_declined: 'declined' } as const;
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: managerId,
      type,
      title: titles[type],
      body: `${firstName(artistName, 'An artist')} ${verbs[type]} ${venueName}, ${date}`,
      isRead: false,
      relatedId: bookingId,
      relatedType: 'booking',
      createdAt: new Date().toISOString(),
    });
  };
  const markRelatedNotificationsRead = (bookingId: string) => {
    allNotifications
      .filter((n) => n.userId === currentUser?.id && !n.isRead && n.relatedId === bookingId && n.relatedType === 'booking')
      .forEach((n) => markAsRead(n.id));
  };
  const handleConfirm = (item: (typeof needsReply)[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation' ||
      (item.status === 'requested' && !!item.resolvedDate && isPastEnd(item.resolvedDate, item.resolvedStart, item.resolvedEnd));
    Alert.alert(
      isPastConfirmation ? 'Confirm Completed Gig' : 'Confirm Booking',
      isPastConfirmation ? `Confirm that you played this gig at ${item.resolvedVenueName}?` : `Confirm your booking at ${item.resolvedVenueName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => {
          const now = new Date().toISOString();
          if (isPastConfirmation) {
            updateBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now, updatedAt: now, artistRespondedFromRequests: true });
            syncBookingStatus(item.id, 'completed', { isCompleted: true, confirmedAt: now });
          } else {
            updateBookingStatus(item.id, 'confirmed', { confirmedAt: now, artistRespondedFromRequests: true });
            syncBookingStatus(item.id, 'confirmed', { confirmedAt: now });
          }
          markRelatedNotificationsRead(item.id);
          notifyManager(item.managerId, 'booking_confirmed', item.id, item.resolvedVenueName, item.resolvedDate ? formatDate(item.resolvedDate) : '');
        } },
      ]
    );
  };
  const handleDecline = (item: (typeof needsReply)[number]) => {
    const isPastConfirmation = item.status === 'past_confirmation' ||
      (item.status === 'requested' && !!item.resolvedDate && isPastEnd(item.resolvedDate, item.resolvedStart, item.resolvedEnd));
    Alert.alert(
      isPastConfirmation ? 'Decline Completed Gig' : 'Decline Booking',
      isPastConfirmation ? `Confirm that you did NOT play this gig at ${item.resolvedVenueName}?` : `Decline your booking at ${item.resolvedVenueName}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => {
          updateBookingStatus(item.id, 'declined', { updatedAt: new Date().toISOString(), artistRespondedFromRequests: true });
          hideFromCalendar(item.id);
          syncBookingStatus(item.id, 'declined', { hiddenFromCalendar: true });
          markRelatedNotificationsRead(item.id);
          notifyManager(item.managerId, 'booking_declined', item.id, item.resolvedVenueName, item.resolvedDate ? formatDate(item.resolvedDate) : '');
        } },
      ]
    );
  };

  const stripFill = (state: string) =>
    state === 'pending' ? STATUS_COLORS.pending
    : state === 'booked' ? STATUS_COLORS.confirmed
    : state === 'cancelled' ? colors.cancelled
    : colors.background;

  // "TODAY" / "TOMORROW" / "FRI 14 AUG" — the Bookings date-group header.
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

  // Open the venue in Google Maps (directions). Prefers saved coordinates, else the address
  // or venue name. Mirrors app/(artist)/booking-detail.tsx.
  // Confirm before leaving the app for Google Maps.
  const confirmOpenMaps = (url: string) => {
    Alert.alert('Open in Google Maps?', 'This opens the location in Google Maps.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: () => Linking.openURL(url).catch(() => Alert.alert('Unable to open', "This device can't open that link.")) },
    ]);
  };

  const openVenueMaps = (b: (typeof dashboardBookings)[number]) => {
    const venue = allVenues.find((v) => v.id === b.venueId);
    const loc = venue?.googleMapsLocation;
    const url = (loc?.lat && loc?.lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue?.name || b.venueName || '')}`;
    confirmOpenMaps(url);
  };

  // Private events have a free-text location the artist typed (e.g. "Dubai Marina"), not a
  // geocoded venue — open Maps as a search on that text.
  const openPrivateEventMaps = (loc: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    confirmOpenMaps(url);
  };

  const renderDateGroup = ({ date, gigs }: { date: string; gigs: (typeof dashboardBookings) }) => (
    <View key={date}>
      <View style={styles.dateHeader}>
        {(() => {
          const label = formatDateHeader(date);
          const isSoon = label === 'TODAY' || label === 'TOMORROW';
          return <Text style={[styles.dateHeaderLabel, { color: isSoon ? colors.foreground : colors.muted }]}>{label}</Text>;
        })()}
        <View style={[styles.dateHeaderLine, { backgroundColor: colors.border }]} />
      </View>
      {gigs.map((b) => {
        const venueName = b.isArtistCreated ? (b.slotName ?? 'Private Booking') : bookingVenueName(b, b.venue?.name);
        const startTime = b.slot?.startTime ?? b.slotStartTime ?? '';
        return (
          <Pressable
            key={b.id}
            style={({ pressed }) => [styles.gigRow, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(artist)/booking-detail?id=' + b.id) as Href)}
          >
            {b.isArtistCreated ? (
              // Private events get an occasion icon tile (matches the calendar), not a venue image.
              <View style={[styles.gigPrivateTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ fontSize: 15, fontWeight: '800', letterSpacing: 0.5, color: colors.primary }}>PB</Text>
              </View>
            ) : (
              <Image source={venueImageFor(b.venue, b.venueType)} style={styles.gigVenueAvatar} resizeMode="cover" />
            )}
            <View style={styles.gigInfo}>
              <Text style={[styles.gigName, { color: colors.foreground }]} numberOfLines={1}>{venueName}</Text>
              {!b.isArtistCreated ? (
                <Pressable hitSlop={6} onPress={() => openVenueMaps(b)} style={({ pressed }) => [styles.gigMapsRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="place" size={13} color={colors.muted} />
                  <Text style={[styles.gigMapsText, { color: colors.muted }]}>Maps</Text>
                </Pressable>
              ) : b.privateEventLocation ? (
                <Pressable hitSlop={6} onPress={() => openPrivateEventMaps(b.privateEventLocation!)} style={({ pressed }) => [styles.gigMapsRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="place" size={13} color={colors.muted} />
                  <Text style={[styles.gigMapsText, { color: colors.muted }]} numberOfLines={1}>{b.privateEventLocation}</Text>
                </Pressable>
              ) : null}
            </View>
            {startTime ? (
              <View style={styles.gigTimeRow}>
                <MaterialIcons name="schedule" size={13} color={colors.muted} />
                <Text style={[styles.gigTime, { color: colors.muted }]}>{fmtTime(startTime)}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ScreenContainer>
      {/* Frozen header — "Overview" + about info + notifications. */}
      <View style={styles.header}>
        <View style={styles.overviewHead}>
          <Text style={[styles.overviewTitle, { color: colors.foreground }]}>Bookings</Text>
          <Pressable
            style={({ pressed }) => [styles.infoBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => setShowAbout(true)}
            hitSlop={8}
          >
            <MaterialIcons name="info-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>
        <Pressable style={styles.notifBtn} onPress={() => router.push('/(artist)/notifications' as Href)}>
          <MaterialIcons name="notifications" size={22} color={colors.foreground} />
          {unreadCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>
          )}
        </Pressable>
      </View>

      {/* Everything scrolls: the "This month" card (earnings + Needs your reply) → Bookings → EARLIER. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* This-month card — earnings summary + Needs your reply, folded together. Always shown, so a
            brand-new artist (no bookings yet) still sees a "this month · AED 0" card, not a bare screen. */}
        <View style={[styles.earnCard, { backgroundColor: colors.surface }]}>
            <View style={styles.earnCardHead}>
              <Text style={[styles.earnCardMonth, { color: colors.muted }]}>{thisMonthLabel}</Text>
              <Text style={[styles.earnCardGigs, { color: colors.muted }]}>{thisMonth.gigs} gig{thisMonth.gigs !== 1 ? 's' : ''}</Text>
            </View>
            <Text style={[styles.earnCardTotal, { color: colors.foreground }]}>AED {thisMonth.total.toLocaleString()}</Text>
            <View style={styles.earnCardBar}>
              {thisMonth.total > 0 ? (
                <>
                  {thisMonth.earned > 0 && <View style={{ flex: thisMonth.earned, backgroundColor: colors.primary }} />}
                  {thisMonth.booked > 0 && <View style={{ flex: thisMonth.booked, backgroundColor: colors.muted + '55' }} />}
                </>
              ) : (
                <View style={{ flex: 1, backgroundColor: colors.muted + '2E' }} />
              )}
            </View>
            <View style={styles.earnLegendRow}>
              <View style={styles.earnLegendItem}>
                <View style={[styles.earnLegendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.earnLegendText, { color: colors.muted }]}><Text style={{ color: colors.foreground, fontWeight: '700' }}>AED {thisMonth.earned.toLocaleString()}</Text> earned</Text>
              </View>
              <View style={styles.earnLegendItem}>
                <View style={[styles.earnLegendDot, { backgroundColor: colors.muted + '55' }]} />
                <Text style={[styles.earnLegendText, { color: colors.muted }]}><Text style={{ color: colors.foreground, fontWeight: '700' }}>AED {thisMonth.booked.toLocaleString()}</Text> booked</Text>
              </View>
            </View>

            {/* NEEDS YOUR REPLY — folded into the card, with the fee on each request. */}
            {needsReply.length > 0 && (
              <>
                <View style={[styles.earnCardDivider, { backgroundColor: colors.border }]} />
                <Text style={[styles.replyLabel, { color: STATUS_COLORS.pending, marginBottom: 2 }]}>NEEDS YOUR REPLY · {needsReply.length}</Text>
                {needsReply.map((item) => (
                  <View key={item.id} style={styles.replyCard}>
                    <Pressable style={({ pressed }) => [styles.replyMain, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.push(('/(artist)/booking-detail?id=' + item.id) as Href)}>
                      <Image source={venueImageFor(item.venue, item.resolvedVenueType)} style={styles.replyThumb} resizeMode="cover" />
                      <View style={styles.replyInfo}>
                        <Text style={[styles.replyName, { color: colors.foreground }]} numberOfLines={1}>{item.resolvedVenueName}</Text>
                        <Text style={[styles.replySub, { color: colors.muted }]} numberOfLines={1}>
                          {item.resolvedDate ? formatDate(item.resolvedDate) : ''}{item.resolvedStart ? ` · ${fmtTime(item.resolvedStart)}` : ''}
                          {item.price != null ? <Text style={{ color: colors.primary, fontWeight: '700' }}> · AED {item.price.toLocaleString()}</Text> : null}
                        </Text>
                      </View>
                    </Pressable>
                    <View style={styles.replyActions}>
                      <Pressable style={({ pressed }) => [styles.replyBtn, { backgroundColor: colors.muted + '2E', opacity: pressed ? 0.7 : 1 }]} onPress={() => handleDecline(item)}>
                        <MaterialIcons name="close" size={20} color={colors.muted} />
                      </Pressable>
                      <Pressable style={({ pressed }) => [styles.replyBtn, { backgroundColor: STATUS_COLORS.confirmed, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleConfirm(item)}>
                        <MaterialIcons name="check" size={20} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}
        </View>

        {/* Cancelled heads-up — a manager cancelled a booked gig; surfaced here + "Got it" to clear. */}
        {cancelledHeadsUp.length > 0 && (
          <View style={styles.cancelledWrap}>
            <Text style={[styles.replyLabel, { color: STATUS_COLORS.pending, marginBottom: 2 }]}>CANCELLED · {cancelledHeadsUp.length}</Text>
            {cancelledHeadsUp.map((item) => (
              <View key={item.id} style={styles.replyCard}>
                <Pressable style={({ pressed }) => [styles.replyMain, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.push(('/(artist)/booking-detail?id=' + item.id) as Href)}>
                  <Image source={venueImageFor(item.venue, item.resolvedVenueType)} style={styles.replyThumb} resizeMode="cover" />
                  <View style={styles.replyInfo}>
                    <Text style={[styles.replyName, { color: colors.foreground }]} numberOfLines={1}>{item.resolvedVenueName}</Text>
                    <Text style={[styles.replySub, { color: colors.muted }]} numberOfLines={1}>
                      {item.resolvedDate ? formatDate(item.resolvedDate) : ''}{item.resolvedStart ? ` · ${fmtTime(item.resolvedStart)}` : ''}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.replyActions}>
                  <Pressable style={({ pressed }) => [styles.gotItBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]} onPress={() => dismissCancelled(item.id, item.status)}>
                    <Text style={[styles.gotItText, { color: colors.muted }]}>Got it</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming gigs grouped by day. The tab header now reads "Bookings", so no section title here. */}
        {bookingsByDate.length === 0 ? (
          <View style={[styles.emptyCard, { marginTop: 20 }]}>
            <MaterialIcons name="event" size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>{bookingsByDate.map(renderDateGroup)}</View>
        )}

        {/* Past bookings — a quiet centred link at the bottom; the month-by-month history opens
            on its own page. No separator above (the dashboard ends on this). */}
        {hasPastBookings && (
          <Pressable
            onPress={() => router.push('/(artist)/past-bookings' as Href)}
            style={({ pressed }) => [styles.pastLink, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Text style={[styles.pastLinkText, { color: colors.muted }]}>Past bookings</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        )}
      </ScrollView>

      {/* About popover — opened from the (i) next to Overview. Tap anywhere to dismiss. */}
      <Modal visible={showAbout} transparent animationType="fade" onRequestClose={() => setShowAbout(false)}>
        <Pressable style={styles.aboutBackdrop} onPress={() => setShowAbout(false)}>
          <View style={[styles.aboutCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Your bookings</Text>
            <Text style={[styles.aboutText, { color: colors.muted }]}>
              This month's earnings, your upcoming bookings, and completed gigs — all in one place.
            </Text>
          </View>
        </Pressable>
      </Modal>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  overviewHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoBtn: { padding: 2 },
  aboutBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  aboutCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 18, maxWidth: 300, gap: 8 },
  aboutTitle: { fontSize: 15, fontWeight: '700' },
  aboutText: { fontSize: 14, lineHeight: 20 },
  frozenOverview: { paddingHorizontal: 20, paddingTop: 8 },   // pinned Overview block (header + strip)
  scrollBelow: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 32 },   // scrolling area under the pinned Overview
  // Section dividers + sticky titles. Gap divider->title = sectionBand.marginBottom(22) + stickyTitle.paddingTop(4) = 26.
  sectionBand: { height: 8, marginHorizontal: -20, marginTop: 8, marginBottom: 22 },
  stickyTitle: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  stickyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },   // chevron sits right next to the title
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E2674A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  sectionTitle: { fontSize: 22, fontWeight: '600' },
  overviewTitle: { fontSize: 24, fontFamily: fonts.bodyBold, letterSpacing: -0.5 },   // "Overview" — GS Bold, title case
  overviewInfo: { padding: 2 },
  sectionBreak: { height: 8, marginHorizontal: -20, marginTop: 8, marginBottom: 4 },      // thick full-bleed divider under Overview

  // Overview strip
  strip: { marginBottom: 4 },
  daysScroll: { paddingRight: 4 },
  stripHeaderRow: { flexDirection: 'row', height: 24, marginBottom: 6 },
  cellsRow: { flexDirection: 'row', height: 40, marginBottom: 8 },
  dayCol: { width: 44, alignItems: 'center', justifyContent: 'center' },
  stripDow: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  cellPress: { alignItems: 'center', justifyContent: 'center' },
  cellRingWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  cellBox: { width: '100%', aspectRatio: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cellNum: { fontSize: 14, fontWeight: '600' },

  // Inline day panel
  inlinePanel: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, marginTop: 4, marginBottom: 8 },
  inlinePanelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inlinePanelDate: { fontSize: 16, fontFamily: fonts.bodyBold, letterSpacing: -0.3 },
  inlinePanelCount: { fontSize: 13, fontWeight: '600' },
  inlinePanelDivider: { height: StyleSheet.hairlineWidth, marginTop: 10, marginBottom: 4 },
  inlinePanelEmpty: { fontSize: 14, paddingVertical: 10 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  inlineTime: { fontSize: 13, fontWeight: '600', width: 66 },
  inlineName: { fontSize: 15, fontWeight: '600', flex: 1 },
  inlineRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineDismiss: { padding: 2 },
  statusChip: { alignSelf: 'center', height: 30, minWidth: 76, borderRadius: 9, paddingVertical: 0, justifyContent: 'center' },   // centred + button-sized (matches manager)
  statusChipText: { fontSize: 13 },

  // Needs your reply
  replyHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  replyLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  replyLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginLeft: 12 },
  replyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  replyMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  replyThumb: { width: 48, height: 48, borderRadius: 14 },
  replyInfo: { flex: 1 },
  replyName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  replySub: { fontSize: 13, fontWeight: '500' },
  replyFee: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  gotItBtn: { height: 36, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gotItText: { fontSize: 14, fontWeight: '600' },

  section: { marginTop: 24 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },

  // Bookings — date-grouped rows (venue avatar + name + time + maps)
  bookingsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Earnings — big total + per-month rows with a proportional bar; tap a month to expand its venues.
  earnTotal: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, marginTop: 6 },   // matches the manager Roster Balance total
  earnSummary: { fontSize: 14, marginTop: 2, marginBottom: 8 },
  earnRowDivider: { height: StyleSheet.hairlineWidth },
  earnInsetDivider: { height: StyleSheet.hairlineWidth * 2 },
  earnCard: { borderRadius: 16, padding: 18, marginTop: 8, marginBottom: 4 },
  earnCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earnCardGigs: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  earnCardDivider: { height: StyleSheet.hairlineWidth, marginTop: 16, marginBottom: 12 },
  cancelledWrap: { marginTop: 20 },
  earnCardMonth: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  earnCardTotal: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  earnCardBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginTop: 16, marginBottom: 14 },
  earnLegendRow: { flexDirection: 'row', gap: 20 },
  earnLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  earnLegendDot: { width: 9, height: 9, borderRadius: 5 },
  earnLegendText: { fontSize: 13 },
  earnEarlierLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  pastLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 22, marginTop: 12 },
  pastLinkText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  earnSquare: { width: 12, height: 12, borderRadius: 3 },
  earnSegBar: { flexDirection: 'row', height: 14, gap: 3, marginTop: 16, marginBottom: 6 },
  earnMonthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  earnMonthInfo: { flex: 1 },
  earnMonthLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  earnMonthSub: { fontSize: 13, marginTop: 2 },
  earnMonthGigs: { fontSize: 14 },
  histVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingTop: 12 },
  venueBottomPad: { height: 12 },
  histVenueName: { flex: 1, fontSize: 14 },
  histVenueGigs: { fontSize: 13 },
  histVenueAmount: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
  histTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  histTotalLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  histTotalAmount: { fontSize: 16, fontWeight: '800' },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 8 },
  dateHeaderLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dateHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginLeft: 12 },
  gigRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  gigVenueAvatar: { width: 48, height: 48, borderRadius: 14 },
  gigPrivateTile: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gigInfo: { flex: 1 },
  gigName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },   // matches the manager dashboard's booking-row name
  gigTime: { fontSize: 13, fontWeight: '500' },
  gigTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gigMapsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, alignSelf: 'flex-start' },
  gigMapsText: { fontSize: 12, fontWeight: '500' },

  // Legend popover
});
