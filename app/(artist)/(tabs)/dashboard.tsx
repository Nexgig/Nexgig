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
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
        isArtistCreated: b.is_artist_created ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
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
  const [showLegend, setShowLegend] = useState(false);
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
        name: b.isArtistCreated ? (b.slotName ?? 'Private Event') : bookingVenueName(b, allVenues.find((v) => v.id === b.venueId)?.name),
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
  const openVenueMaps = (b: (typeof dashboardBookings)[number]) => {
    const venue = allVenues.find((v) => v.id === b.venueId);
    const loc = venue?.googleMapsLocation;
    const url = (loc?.lat && loc?.lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue?.name || b.venueName || '')}`;
    Linking.openURL(url).catch(() => Alert.alert('Unable to open', "This device can't open that link."));
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
        const venueName = b.isArtistCreated ? (b.slotName ?? 'Private Event') : bookingVenueName(b, b.venue?.name);
        const startTime = b.slot?.startTime ?? b.slotStartTime ?? '';
        return (
          <Pressable
            key={b.id}
            style={({ pressed }) => [styles.gigRow, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(artist)/booking-detail?id=' + b.id) as Href)}
          >
            {b.isArtistCreated ? (
              // Private events get the same neutral date tile as the calendar (not a venue image).
              <View style={[styles.gigPrivateTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.gigPrivateShort, { color: colors.muted }]}>{new Date((date || b.slotDate || '') + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={[styles.gigPrivateNum, { color: colors.foreground }]}>{new Date((date || b.slotDate || '') + 'T00:00:00').getDate()}</Text>
              </View>
            ) : (
              <Image source={venueImageFor(b.venue, b.venueType)} style={styles.gigVenueAvatar} resizeMode="cover" />
            )}
            <View style={styles.gigInfo}>
              <Text style={[styles.gigName, { color: colors.foreground }]} numberOfLines={1}>{venueName}</Text>
              {!b.isArtistCreated && (
                <Pressable hitSlop={6} onPress={() => openVenueMaps(b)} style={({ pressed }) => [styles.gigMapsRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <MaterialIcons name="place" size={13} color={colors.muted} />
                  <Text style={[styles.gigMapsText, { color: colors.muted }]}>Maps</Text>
                </Pressable>
              )}
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
      {/* Frozen header — "Overview" + legend + notifications, stays put while content scrolls. */}
      <View style={styles.header}>
        <View style={styles.overviewHead}>
          <Text style={[styles.overviewTitle, { color: colors.foreground }]}>Overview</Text>
          <Pressable hitSlop={10} onPress={() => setShowLegend(true)} style={styles.overviewInfo}>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
        {/* Overview strip — one horizontal row of the next 31 days, colored by status. */}
        <View style={styles.strip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScroll}>
            <View>
              <View style={styles.stripHeaderRow}>
                {stripDays.map(({ date }) => (
                  <View key={date} style={styles.dayCol}>
                    <Text style={[styles.stripDow, { color: colors.muted }]}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.cellsRow}>
                {stripDays.map(({ date, state }) => {
                  const isSel = selected === date;
                  // Today is rendered as a normal day for now (no coral).
                  const numColor = state === 'none' ? colors.muted : '#fff';
                  return (
                    <View key={date} style={styles.dayCol}>
                      <Pressable style={({ pressed }) => [styles.cellPress, { opacity: pressed ? 0.5 : 1 }]} onPress={() => toggleDay(date)}>
                        <View style={[styles.cellRingWrap, isSel && { padding: 2, borderWidth: 2, borderColor: colors.primary, borderRadius: 12 }]}>
                          <View style={[styles.cellBox, { backgroundColor: stripFill(state) }]}>
                            <Text style={[styles.cellNum, { color: numColor }]}>
                              {new Date(date + 'T00:00:00').getDate()}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Inline panel — the selected day's gigs (time · venue · status). */}
          {selected && (
            <View style={[styles.inlinePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.inlinePanelHead}>
                <Text style={[styles.inlinePanelDate, { color: colors.foreground }]}>{panelDateLabel}</Text>
                <Text style={[styles.inlinePanelCount, { color: colors.muted }]}>{panelGigs.length} gig{panelGigs.length === 1 ? '' : 's'}</Text>
              </View>
              <View style={[styles.inlinePanelDivider, { backgroundColor: colors.border }]} />
              {panelGigs.length === 0 ? (
                <Text style={[styles.inlinePanelEmpty, { color: colors.muted }]}>No gigs on this day.</Text>
              ) : (
                panelGigs.map((g) => (
                  <Pressable key={g.id} style={({ pressed }) => [styles.inlineRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => router.push(('/(artist)/booking-detail?id=' + g.id) as Href)}>
                    <Text style={[styles.inlineTime, { color: colors.muted }]} numberOfLines={1}>{g.startTime ? fmtTime(g.startTime) : ''}</Text>
                    <Text style={[styles.inlineName, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                    <View style={styles.inlineRight}>
                      <StatusBadge status={g.shown as any} />
                      {g.dismissable && (
                        <Pressable hitSlop={8} style={styles.inlineDismiss} onPress={() => dismissCancelled(g.id, g.status)}>
                          <MaterialIcons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
        <View style={[styles.sectionBreak, { backgroundColor: colors.surface }]} />

        {/* Needs your reply — only when there are live requests to answer. */}
        {needsReply.length > 0 && (
          <View style={styles.section}>
            <View style={styles.replyHead}>
              <Text style={[styles.replyLabel, { color: STATUS_COLORS.pending }]}>NEEDS YOUR REPLY</Text>
              <View style={[styles.replyLine, { backgroundColor: colors.border }]} />
            </View>
            {needsReply.map((item) => (
              <View key={item.id} style={styles.replyCard}>
                <Pressable style={({ pressed }) => [styles.replyMain, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.push(('/(artist)/booking-detail?id=' + item.id) as Href)}>
                  <Image source={venueImageFor(item.venue, item.resolvedVenueType)} style={styles.replyThumb} resizeMode="cover" />
                  <View style={styles.replyInfo}>
                    <Text style={[styles.replyName, { color: colors.foreground }]} numberOfLines={1}>{item.resolvedVenueName}</Text>
                    <Text style={[styles.replySub, { color: colors.muted }]} numberOfLines={1}>
                      {item.resolvedDate ? formatDate(item.resolvedDate) : ''}{item.resolvedStart ? ` · ${fmtTime(item.resolvedStart)}–${fmtTime(item.resolvedEnd ?? '')}` : ''}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.replyActions}>
                  <Pressable style={({ pressed }) => [styles.replyBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]} onPress={() => handleDecline(item)}>
                    <MaterialIcons name="close" size={20} color={colors.muted} />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.replyBtn, { backgroundColor: STATUS_COLORS.confirmed, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleConfirm(item)}>
                    <MaterialIcons name="check" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Bookings — booked (confirmed) gigs only, date-grouped (TODAY / FRI 14 AUG), venue
            avatar + name + time, maps on right. The count of booked gigs sits by the title. */}
        <View style={styles.section}>
          <View style={styles.bookingsHead}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bookings</Text>
          </View>
          {bookingsByDate.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No bookings yet</Text>
            </View>
          ) : (
            <View>{bookingsByDate.map(renderDateGroup)}</View>
          )}
        </View>

      </ScrollView>

      {/* Legend popover — opened from the (i) next to Overview. Tap anywhere to dismiss. */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={styles.legendBackdrop} onPress={() => setShowLegend(false)}>
          <View style={[styles.legendCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.legendCardTitle, { color: colors.foreground }]}>What the colors mean</Text>
            {[
              { label: 'Booked', swatch: { backgroundColor: STATUS_COLORS.confirmed } },
              { label: 'Pending', swatch: { backgroundColor: STATUS_COLORS.pending } },
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
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#E2674A', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  sectionTitle: { fontSize: 22, fontWeight: '600' },
  overviewTitle: { fontSize: 24, fontFamily: fonts.bodyBold, letterSpacing: -0.5 },   // "Overview" — GS Bold, title case
  overviewHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  section: { marginTop: 24 },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },

  // Bookings — date-grouped rows (venue avatar + name + time + maps)
  bookingsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 8 },
  dateHeaderLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dateHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, marginLeft: 12 },
  gigRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  gigVenueAvatar: { width: 48, height: 48, borderRadius: 14 },
  gigPrivateTile: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gigPrivateShort: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  gigPrivateNum: { fontSize: 18, fontFamily: fonts.bodySemibold },
  gigInfo: { flex: 1 },
  gigName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },   // matches the manager dashboard's booking-row name
  gigTime: { fontSize: 13, fontWeight: '500' },
  gigTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gigMapsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, alignSelf: 'flex-start' },
  gigMapsText: { fontSize: 12, fontWeight: '500' },

  // Legend popover
  legendBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  legendCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 18, minWidth: 220, gap: 12 },
  legendCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  legendCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendCardText: { fontSize: 14 },
});
