import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Section, Divider, ListRow, IconTile, Chip, SoftButton } from '@/components/ui/card-free';
import { useBookingStore, useSlotStore, useVenueStore, useAuthStore, useReviewStore, useLineupStore, useDraftStore, useNotificationStore, useInvoiceStore } from '@/lib/store';
import { PastGigPriceModal } from '@/components/past-gig-price-modal';
import type { Href } from 'expo-router';
import { venueImageFor } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import { openMapsChooser } from '@/lib/maps';
import { displayStatus, bookingVenueName, firstName } from '@/lib/utils';
import { syncBookingStatus } from '@/lib/booking-sync';
import { supabase } from '@/lib/supabase';
import { sendDraftRequest } from '@/lib/gig-requests';
import { fetchReviews } from '@/lib/reviews';
import type { Booking } from '@/lib/types';

/** Venue image at IconTile's size/radius. Derived from the venue TYPE, so it always
 *  resolves — and it falls back to the type snapshotted on the booking, since the
 *  venue row can be unreadable (artist disconnected, venue hidden). */
function VenueThumb({ venue, snapshotType }: { venue?: { venueType?: string } | null; snapshotType?: string }) {
  return <Image source={venueImageFor(venue, snapshotType)} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="cover" />;
}

/** A label/value row, borrowed from the invoice's document language. No icon — an
 *  agreement states facts, it doesn't decorate them. `last` drops the hairline. */
function DetailRow({ label, value, trailing, last = false }: {
  label: string; value?: string; trailing?: React.ReactNode; last?: boolean;
}) {
  const colors = useColors();
  if (!value && !trailing) return null;
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2 }]}>
      <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
      <View style={styles.detailValueWrap}>
        {value ? <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

/** Compact "Maps" badge — ink on a grey surface, so it reads as a control rather than
 *  competing with the coral used for status. Replaces the old full-width
 *  "Open in Google Maps" row. */
function MapsBadge({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.mapsBadge, { backgroundColor: colors.primary + '20', opacity: pressed ? 0.7 : 1 }]}
    >
      <MaterialIcons name="directions" size={15} color={colors.primary} />
      <Text style={[styles.mapsBadgeText, { color: colors.primary }]}>Maps</Text>
    </Pressable>
  );
}

export default function DJBookingDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { formatTime: fmtTime } = useFormatTime();
  // `slotId` (no `id`) opens this screen for an EMPTY set — a slot with no bookings
  // yet. The calendar now routes every set tap here, so a 0-artist set lands in the
  // slot-only branch below (set info + "Assign Artist", no artist rows).
  const { id, slotId: slotIdParam } = useLocalSearchParams<{ id?: string; slotId?: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  // Subscribe to the ARRAY, not to getReviewByBooking — that getter is a stable
  // reference, so depending on it alone means the fetch below resolves, the store
  // updates, and this screen never re-renders to show the review that just arrived.
  const allReviews = useReviewStore((s) => s.reviews);
  const setReviews = useReviewStore((s) => s.setReviews);
  // Reviews are written by the ARTIST on their device, so this manager's cache has no
  // copy until it is fetched. Without this the screen reads "No review yet" forever —
  // which is exactly the bug the review notification pointed at.
  useEffect(() => { fetchReviews().then(setReviews); }, []);

  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === id));
  const allBookings = useBookingStore((s) => s.bookings);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const hideFromManagerCalendar = useBookingStore((s) => s.hideFromManagerCalendar);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const allDrafts = useDraftStore((s) => s.drafts);
  const removeDraftByDJ = useDraftStore((s) => s.removeDraftByDJ);
  const setDraft = useDraftStore((s) => s.setDraft);
  const allInvoices = useInvoiceStore((s) => s.invoices);
  // Fee editing is per artist: `feeTarget` names which booking OR draft the price modal is editing.
  const [feeTarget, setFeeTarget] = useState<
    | { kind: 'booking'; bookingId: string; bookingStatus: Booking['status']; artistId: string; venueName: string | null; slotDate: string; price?: number; isGuest?: boolean }
    | { kind: 'draft'; slotId: string; venueId: string; artistId: string; price?: number }
    | null
  >(null);
  // Invoiced gigs are settled — the invoice locked that number, so editing the booking price
  // would let the two disagree. Block the edit once any non-cancelled invoice covers this gig.
  // A gig is locked (fee can't change) once a non-cancelled invoice covers it.
  const bookingInvoiced = (bId: string) =>
    allInvoices.some((inv) => inv.status !== 'cancelled' && inv.gigs.some((g) => g.bookingId === bId));

  // Fee editing is PER ARTIST. Bookings confirm + notify (an agreed fee changed); drafts just save.
  const openBookingFee = (b: Booking) => {
    if (bookingInvoiced(b.id)) return;   // invoiced is locked — FeeLine shows "Invoiced", not tappable
    setFeeTarget({
      kind: 'booking', bookingId: b.id, bookingStatus: b.status, artistId: b.artistId,
      venueName: bookingVenueName(b, getVenueById(b.venueId)?.name), slotDate: b.slotDate ?? '', price: b.price ?? undefined,
      isGuest: !!b.guestName,
    });
  };
  const openDraftFee = (d: { slotId: string; venueId: string; artistId: string; price?: number }) =>
    setFeeTarget({ kind: 'draft', slotId: d.slotId, venueId: d.venueId, artistId: d.artistId, price: d.price });

  const saveTargetFee = (price: number | undefined) => {
    const t = feeTarget;
    setFeeTarget(null);
    if (!t || price == null) return;
    if (t.kind === 'draft') {
      if (!currentUser) return;
      setDraft(t.slotId, t.venueId, t.artistId, currentUser.id, price);
      return;
    }
    // Guest DJ: no real artist to notify — just save the fee straight to the booking.
    if (t.isGuest) {
      updateBookingStatus(t.bookingId, t.bookingStatus, { price });
      return;
    }
    // Booking: confirm first — it changes an agreed fee AND notifies the artist.
    const artistName = getArtistUser(t.artistId)?.fullName ?? 'the artist';
    const dateStr = t.slotDate ? formatDate(t.slotDate) : '';
    Alert.alert(
      'Update fee',
      `Set ${artistName}'s fee for ${t.venueName ?? 'the venue'}${dateStr ? `, ${dateStr}` : ''} to AED ${price.toLocaleString()}? They'll be notified of the change.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update & notify',
          onPress: () => {
            updateBookingStatus(t.bookingId, t.bookingStatus, { price });
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: t.artistId,
              type: 'booking_fee_updated',
              title: 'Fee updated',
              body: `${firstName(currentUser?.fullName, 'Your manager')} set your fee for ${t.venueName ?? 'the venue'}${dateStr ? `, ${dateStr}` : ''} to AED ${price.toLocaleString()}`,
              isRead: false,
              relatedId: t.bookingId,
              relatedType: 'booking',
              createdAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  };

  // Tappable fee line shown under each artist's name (per-artist). Invoiced gigs are read-only.
  const FeeLine = ({ price, invoiced, onPress }: { price?: number | null; invoiced?: boolean; onPress?: () => void }) => {
    if (invoiced) {
      return <Text style={[styles.rowFeeMuted, { color: colors.muted }]}>{price != null ? `AED ${price.toLocaleString()} · Invoiced` : 'Invoiced'}</Text>;
    }
    return (
      <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.rowFee, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.rowFeeText, { color: colors.primary }]}>{price != null ? `AED ${price.toLocaleString()}` : 'Set fee'}</Text>
        <MaterialIcons name="edit" size={12} color={colors.primary} />
      </Pressable>
    );
  };

  // Dashed "+ Add Artist" row — opens the picker (assign-artist) for this slot.
  const AddArtistRow = ({ slotId }: { slotId: string }) => (
    <Pressable
      style={({ pressed }) => [styles.addArtistRow, { opacity: pressed ? 0.6 : 1 }]}
      onPress={() => router.push(('/(manager)/assign-artist?slotId=' + slotId) as Href)}
    >
      <View style={[styles.addArtistCircle, { borderColor: colors.primary }]}>
        <MaterialIcons name="add" size={22} color={colors.primary} />
      </View>
      <Text style={[styles.addArtistText, { color: colors.primary }]}>Add Artist</Text>
    </Pressable>
  );

  // ── Slot-only mode: an empty set (no bookings) opened from the calendar ──────
  if (!booking) {
    const emptySlot = getSlotById(slotIdParam ?? '');
    if (emptySlot) {
      const emptyVenue = getVenueById(emptySlot.venueId);
      const loc = emptyVenue?.googleMapsLocation;
      // Drafted-but-not-sent artists on this slot. This is the common case for M7:
      // drafting stages an artist without creating a booking, so the set has 0 bookings
      // and lands here — the drafts must show, or the manager sees "nothing assigned".
      const slotDrafts = allDrafts.filter((d) => d.slotId === emptySlot.id);
      const slotBookings = allBookings.filter((b) => b.slotId === emptySlot.id && !b.hiddenFromManagerCalendar);
      // Send one drafted (not-yet-sent) artist straight from the detail — mirrors the calendar's
      // sendSlotDrafts: create the booking, persist it, notify the artist, then go back.
      const sendDraft = (d: (typeof slotDrafts)[number]) => {
        if (!currentUser) return;
        const name = getArtistUser(d.artistId)?.fullName ?? 'artist';
        Alert.alert(
          'Send Gig Request',
          `Send a gig request to ${name}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              // Stay on this page — the sent draft becomes a booking below and the row updates
              // in place (its Send pill turns into the status chip).
              text: 'Send',
              onPress: () => sendDraftRequest({
                slotId: emptySlot.id, artistId: d.artistId, managerId: currentUser.id, managerName: currentUser.fullName,
                slot: { venueId: emptySlot.venueId, date: emptySlot.date, name: emptySlot.name, startTime: emptySlot.startTime, endTime: emptySlot.endTime },
                draftPrice: d.price ?? null, venueName: emptyVenue?.name ?? null, venueType: emptyVenue?.venueType ?? null,
              }),
            },
          ]
        );
      };
      return (
        <ScreenContainer>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Section label={(slotBookings.length + slotDrafts.length) > 1 ? 'Artists' : 'Artist'}>
              {slotBookings.length === 0 && slotDrafts.length === 0 ? (
                <Text style={{ color: colors.muted, fontSize: 14, paddingVertical: 6 }}>No artist assigned yet.</Text>
              ) : (
                <>
                  {slotBookings.map((b) => {
                    const bArtist = getArtistUser(b.artistId);
                    const isGuest = !!b.guestName;
                    const name = b.guestName ?? bArtist?.fullName ?? 'Artist';
                    const shown = displayStatus(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime);
                    return (
                      <ListRow
                        key={'bk-' + b.id}
                        leading={<AvatarImage uri={isGuest ? undefined : bArtist?.profilePhotoUrl} avatarId={isGuest ? undefined : (bArtist as any)?.avatarId} seed={isGuest ? b.guestName : bArtist?.id} name={name} size={44} />}
                        title={name}
                        subtitleNode={<FeeLine price={b.price} invoiced={bookingInvoiced(b.id)} onPress={() => openBookingFee(b)} />}
                        trailing={<StatusBadge status={shown as any} style={styles.statusChip} textStyle={styles.statusChipText} />}
                        onPress={() => router.push(('/(manager)/booking-detail?id=' + b.id) as Href)}
                        divider
                      />
                    );
                  })}
                  {slotDrafts.map((d) => {
                    const dArtist = getArtistUser(d.artistId);
                    return (
                      <ListRow
                        key={'draft-' + d.artistId}
                        leading={<AvatarImage uri={dArtist?.profilePhotoUrl} avatarId={(dArtist as any)?.avatarId} seed={dArtist?.id} name={dArtist?.fullName ?? 'Artist'} size={44} />}
                        title={dArtist?.fullName ?? 'Artist'}
                        subtitleNode={<FeeLine price={d.price} onPress={() => openDraftFee(d)} />}
                        trailing={
                          <Pressable
                            onPress={() => sendDraft(d)}
                            style={({ pressed }) => [styles.detailSendPill, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                            hitSlop={6}
                          >
                            <Text style={styles.detailSendPillText}>Send</Text>
                          </Pressable>
                        }
                        divider
                      />
                    );
                  })}
                </>
              )}
              <AddArtistRow slotId={emptySlot.id} />
            </Section>

            {emptyVenue ? (
              <Section label="Venue">
                <ListRow
                  leading={<VenueThumb venue={emptyVenue} />}
                  title={emptyVenue.name}
                  subtitle={[emptyVenue.venueType, loc?.address ? cityFromAddress(loc.address) : undefined].filter(Boolean).join('\n') || undefined}
                  divider={false}
                />
              </Section>
            ) : null}

            <Section label="Details">
              <DetailRow label="DATE" value={formatDate(emptySlot.date)} />
              <DetailRow label="TIME" value={`${fmtTime(emptySlot.startTime)} – ${fmtTime(emptySlot.endTime)}`} />
              <DetailRow label="VENUE TYPE" value={emptyVenue?.venueType} />
              <DetailRow
                label="LOCATION"
                value={loc?.address}
                last
                trailing={loc?.address ? (
                  <MapsBadge onPress={() => {
                    openMapsChooser({ lat: loc?.lat, lng: loc?.lng, query: loc?.address || emptyVenue?.name, title: emptyVenue?.name });
                  }} />
                ) : undefined}
              />
            </Section>
          </ScrollView>
          <PastGigPriceModal
            visible={feeTarget != null}
            title={feeTarget?.price != null ? 'Edit fee' : 'Set fee'}
            confirmLabel="Save"
            artistName={feeTarget ? (getArtistUser(feeTarget.artistId)?.fullName ?? 'this artist') : 'this artist'}
            subtitle={`${emptyVenue?.name ?? 'Venue'} · ${formatDate(emptySlot.date)}`}
            defaultPrice={feeTarget?.price}
            onCancel={() => setFeeTarget(null)}
            onConfirm={saveTargetFee}
          />
        </ScreenContainer>
      );
    }
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Booking not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const slot = getSlotById(booking.slotId);
  const venue = getVenueById(booking.venueId);

  // Every booking on this slot the manager hasn't dismissed — cancelled / declined / expired
  // INCLUDED, so they stay visible with an X to dismiss (same as the dashboard day sheet).
  // Rendered uniformly (no primary/co split): first, second, third artist all behave the same.
  const slotBookings = allBookings
    .filter((b) => b.slotId === booking.slotId && !b.hiddenFromManagerCalendar)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  // Drafted artists on this slot (staged, not yet sent). Exclude anyone who already has a
  // booking here. Shown with a "Draft" status so the manager sees who's staged.
  const slotArtistIds = new Set(slotBookings.map((b) => b.artistId));
  const draftArtists = allDrafts.filter((d) => d.slotId === booking.slotId && !slotArtistIds.has(d.artistId));

  const isManager = currentUser?.accountType === 'manager';
  const isDJ = currentUser?.accountType === 'artist';

  const handleAccept = () => {
    Alert.alert('Accept Booking', 'Confirm this booking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept', onPress: () => {
          updateBookingStatus(booking.id, 'confirmed', { confirmedAt: new Date().toISOString() });
          router.back();
        }
      },
    ]);
  };

  const handleDecline = () => {
    Alert.alert('Decline Booking', 'Are you sure you want to decline?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: () => {
          updateBookingStatus(booking.id, 'declined');
          router.back();
        }
      },
    ]);
  };

  // A booking the artist hasn't answered yet is a *request*, not a booking — the copy
  // says so. The write is identical: cancelledAsRequest already marks it as withdrawn
  // rather than a cancellation the artist has to acknowledge.
  const isRequest = booking.status === 'requested' || booking.status === 'past_confirmation';

  // Cancel ONE booking with the correct semantics + notify the artist. A REQUEST the artist
  // hasn't answered is a silent WITHDRAWAL — `cancelledAsRequest` hides it from the artist's
  // calendar and auto-acknowledges it ("Request Withdrawn"). A CONFIRMED booking is a real
  // cancellation the artist MUST see (slate on their calendar/overview, with a dismiss X) — so
  // those flags are NOT set, and they get a "Gig Cancelled" notification. Mirrors venue-detail.
  const cancelBookingWrite = (b: Booking) => {
    const bReq = b.status === 'requested' || b.status === 'past_confirmation';
    const nowIso = new Date().toISOString();
    updateBookingStatus(b.id, 'cancelled', {
      cancelledAt: nowIso,
      ...(bReq ? { cancelledAsRequest: true, cancellationAcknowledged: true } : {}),
    });
    if (b.artistId) {
      addNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: b.artistId,
        type: bReq ? 'booking_request_cancelled' : 'booking_cancelled',
        title: bReq ? 'Request Withdrawn' : 'Cancelled',
        body: `${firstName(currentUser?.fullName, 'The manager')} ${bReq ? 'withdrew the request for' : 'cancelled'} ${bookingVenueName(b, venue?.name)}, ${b.slotDate ? formatDate(b.slotDate) : ''}`,
        isRead: false,
        relatedId: b.id,
        relatedType: 'booking',
        createdAt: nowIso,
      });
    }
  };

  // Per-artist cancel (X next to a live status) — cancels ONE artist and STAYS on the screen.
  // The row turns into a cancelled row with its own dismiss X; the rest of the set is untouched.
  const cancellableStatus = (s: string) => s === 'requested' || s === 'past_confirmation' || s === 'confirmed';
  const cancelOne = (targetId: string) => {
    const target = allBookings.find((b) => b.id === targetId);
    if (!target) return;
    const req = target.status === 'requested' || target.status === 'past_confirmation';
    Alert.alert(
      req ? 'Cancel Request' : 'Cancel Booking',
      req ? "Withdraw this artist's request? The rest of the slot stays."
          : "Cancel this artist's booking? The rest of the slot stays.",
      [
        { text: 'No', style: 'cancel' },
        {
          text: req ? 'Withdraw' : 'Cancel', style: 'destructive',
          // Stay here — the row becomes a cancelled row with an X to dismiss.
          onPress: () => cancelBookingWrite(target),
        },
      ]
    );
  };
  // Dismiss a cancelled / declined / expired row — hides it from the manager (and from the
  // artist too if the artist cancelled). No confirmation, no navigation — same as the
  // dashboard day sheet. Nothing is destroyed; the row just leaves the manager's view.
  const dismissOne = (targetId: string) => {
    const target = allBookings.find((b) => b.id === targetId);
    hideFromManagerCalendar(targetId);
    const syncFields: any = { hiddenFromManagerCalendar: true };
    if (target?.cancelledByArtist) syncFields.hiddenFromCalendar = true;
    syncBookingStatus(targetId, (target?.status ?? 'cancelled') as any, syncFields);
    // Keep the SLOT — dismissing a dead booking frees the slot back to assign mode ("Needs
    // artist"), so the manager can re-assign it (e.g. via "Add Artist" here, which opens
    // assign-artist for this slot) instead of the slot vanishing out from under them.
  };
  // The X handler for any artist row, by its real status.
  const rowDismiss = (b: Booking): (() => void) | undefined => {
    if (b.status === 'cancelled' || b.status === 'declined' || b.status === 'expired') return () => dismissOne(b.id);
    if (cancellableStatus(b.status)) return () => cancelOne(b.id);
    return undefined;
  };
  const removeOneDraft = (artistId: string) => {
    Alert.alert('Remove Draft', 'Remove this drafted artist from the slot?', [
      { text: 'No', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeDraftByDJ(booking.slotId, artistId) },
    ]);
  };
  const StatusWithX = ({ b, onX }: { b: Booking; onX?: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <StatusBadge status={displayStatus(b.status, b.createdAt, b.slotDate, b.slotStartTime, b.slotEndTime) as any} style={styles.statusChip} textStyle={styles.statusChipText} />
      {onX ? (
        <Pressable onPress={onX} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <MaterialIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  const handleCancel = () => {
    Alert.alert(
      isRequest ? 'Cancel Request' : 'Cancel Booking',
      isRequest
        ? 'Withdraw this booking request? The artist will no longer see it.'
        : 'Are you sure you want to cancel this booking?',
      [
      { text: 'No', style: 'cancel' },
      {
        text: isRequest ? 'Yes, Withdraw' : 'Yes, Cancel', style: 'destructive', onPress: () => {
          // A set can hold multiple artists — cancel every live artist on the slot, so the whole
          // set is cancelled. Each is written with the right per-artist semantics + notified.
          slotBookings.filter((b) => cancellableStatus(b.status)).forEach(cancelBookingWrite);
        }
      },
      ]
    );
  };


  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Booking Details</Text>
        </View>

        <View style={styles.content}>
          {/* Artist(s) on this booking's slot. Manager-only. */}
          {isManager && (
            <>
              <Section label={(slotBookings.length + draftArtists.length) > 1 ? 'Artists' : 'Artist'}>
                {slotBookings.length === 0 && draftArtists.length === 0 && (
                  <Text style={{ color: colors.muted, fontSize: 14, paddingVertical: 6 }}>No artist on this slot.</Text>
                )}
                {slotBookings.map((b) => {
                  const rArtist = getArtistUser(b.artistId);
                  const isGuest = !!b.guestName;
                  const name = b.guestName ?? rArtist?.fullName ?? 'Former Artist';
                  return (
                    <ListRow
                      key={b.id}
                      leading={<AvatarImage uri={isGuest ? undefined : rArtist?.profilePhotoUrl} avatarId={isGuest ? undefined : (rArtist as any)?.avatarId} seed={isGuest ? b.guestName : rArtist?.id} name={name} size={44} />}
                      title={name}
                      subtitleNode={<FeeLine price={b.price} invoiced={bookingInvoiced(b.id)} onPress={() => openBookingFee(b)} />}
                      onPress={(rArtist?.id && !isGuest) ? () => router.push(('/(manager)/artist-profile-view?artistId=' + b.artistId + '&name=' + encodeURIComponent(rArtist.fullName ?? '')) as Href) : undefined}
                      trailing={<StatusWithX b={b} onX={rowDismiss(b)} />}
                      divider
                    />
                  );
                })}
                {draftArtists.map((d, i) => {
                  const dArtist = getArtistUser(d.artistId);
                  return (
                    <ListRow
                      key={'draft-' + d.artistId}
                      leading={<AvatarImage uri={dArtist?.profilePhotoUrl} avatarId={(dArtist as any)?.avatarId} seed={dArtist?.id} name={dArtist?.fullName ?? 'Artist'} size={44} />}
                      title={dArtist?.fullName ?? 'Artist'}
                      subtitleNode={<FeeLine price={d.price} onPress={() => openDraftFee(d)} />}
                      trailing={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <StatusBadge status="draft" style={styles.statusChip} textStyle={styles.statusChipText} />
                          <Pressable onPress={() => removeOneDraft(d.artistId)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                            <MaterialIcons name="close" size={18} color={colors.muted} />
                          </Pressable>
                        </View>
                      }
                      divider
                    />
                  );
                })}
                <AddArtistRow slotId={booking.slotId} />
              </Section>
            </>
          )}

          {/* Venue Card — falls back to the booking's venueName snapshot when the venue
              has been deleted, so completed-gig history keeps the real venue name.
              The Maps button lives INSIDE the card (below the venue info). */}
          {venue ? (
            <>
              <Section label="Venue">
                <ListRow
                  leading={<VenueThumb venue={venue} snapshotType={booking.venueType} />}
                  title={bookingVenueName(booking, venue.name)}
                  subtitle={[venue.venueType, venue.googleMapsLocation?.address ? cityFromAddress(venue.googleMapsLocation.address) : undefined].filter(Boolean).join('\n') || undefined}
                  onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
                  divider={false}
                />
              </Section>
            </>
          ) : booking.venueName ? (
            <>
              <Section label="Venue">
                <ListRow leading={<VenueThumb snapshotType={booking.venueType} />} title={booking.venueName} divider={false} />
              </Section>
            </>
          ) : null}

          {/* Details — document-style label/value table. Replaces the icon-tile rows:
              the coral tiles added colour but said nothing the label didn't. */}
          <Section label="Details">
            <DetailRow label="DATE" value={slot ? formatDate(slot.date) : (booking.slotDate ? formatDate(booking.slotDate) : undefined)} />
            <DetailRow
              label="TIME"
              value={
                slot
                  ? `${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`
                  : (booking.slotStartTime && booking.slotEndTime ? `${fmtTime(booking.slotStartTime)} – ${fmtTime(booking.slotEndTime)}` : undefined)
              }
            />
            <DetailRow label="VENUE TYPE" value={venue?.venueType} />
            <DetailRow
              label="LOCATION"
              value={venue?.googleMapsLocation?.address}
              last
              trailing={
                venue?.googleMapsLocation?.address ? (
                  <MapsBadge
                    onPress={() => {
                      const loc = venue.googleMapsLocation;
                      openMapsChooser({ lat: loc?.lat, lng: loc?.lng, query: loc?.address || venue.name, title: venue.name });
                    }}
                  />
                ) : undefined
              }
            />
          </Section>

          {/* Only rule off the Details block when something actually follows it —
              otherwise this drew a line under the last row with nothing beneath. */}
          {(!!venue?.vibeDescription || (venue?.preferredEnergy?.length ?? 0) > 0 || !!venue?.rulesTemplate || booking.status === 'completed') && <Divider />}

          {/* Venue Vibe */}
          {venue && venue.vibeDescription ? (
            <>
              <Section label="Venue Vibe">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
              </Section>
            </>
          ) : null}

          {/* Venue Energy */}
          {venue && venue.preferredEnergy.length > 0 ? (
            <>
              <Section label="Expected Energy">
                <View style={styles.chips}>
                  {venue.preferredEnergy.map((e) => <Chip key={e} label={e} />)}
                </View>
              </Section>
            </>
          ) : null}

          {/* Venue Rules */}
          {venue?.rulesTemplate ? (
            <>
              <Section label="Venue Rules">
                <Text style={[styles.bodyText, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
              </Section>
            </>
          ) : null}

          {/* Artist review(s) — read-only for the manager. One block PER completed artist on this
              slot (a set can have several), attributed by name, so co-artists' reviews aren't hidden
              and "No review yet" is only shown for the artist who actually hasn't reviewed. */}
          {(() => {
            const completed = slotBookings.filter((b) => b.status === 'completed' || b.isCompleted);
            if (completed.length === 0) return null;
            const multi = completed.length > 1;
            return (
              <>
                <Section label={multi ? 'Artist reviews' : 'Artist review'}>
                  {completed.map((b, i) => {
                    const review = allReviews.find((r) => r.bookingId === b.id);
                    const rArtist = getArtistUser(b.artistId);
                    const name = b.guestName ?? rArtist?.fullName ?? 'Former Artist';
                    return (
                      <View
                        key={b.id}
                        style={i > 0 ? { marginTop: 18, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
                      >
                        {multi && <Text style={[styles.reviewArtistName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>}
                        {review ? (
                          <>
                            <View style={styles.starsRow}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <MaterialIcons key={star} name="star" size={28} color={star <= review.rating ? colors.warning : colors.border} />
                              ))}
                            </View>
                            {review.text ? (
                              <Text style={[styles.bodyText, { color: colors.foreground, marginTop: 12 }]}>{review.text}</Text>
                            ) : null}
                          </>
                        ) : multi ? (
                          <Text style={{ fontSize: 13, color: colors.muted }}>No review yet</Text>
                        ) : (
                          <>
                            <Text style={[styles.reviewTitle, { color: colors.foreground }]}>No review yet</Text>
                            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>The artist hasn&apos;t reviewed this gig yet.</Text>
                          </>
                        )}
                      </View>
                    );
                  })}
                </Section>
                <Divider />
              </>
            );
          })()}

          {/* Actions */}
          <View style={styles.actions}>
            {booking.status === 'requested' && isDJ && (
              <>
                <Pressable
                  style={({ pressed }) => [styles.acceptBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
                  onPress={handleAccept}
                >
                  <MaterialIcons name="check-circle" size={18} color="#000" />
                  <Text style={styles.acceptBtnText}>Accept Booking</Text>
                </Pressable>
                <SoftButton tone="danger" icon="cancel" label="Decline" onPress={handleDecline} />
              </>
            )}

            {/* Without this a manager had NO action on a pending request — the block
                above is artist-only, so a request could be sent but never withdrawn. */}
            {isRequest && isManager && (
              <SoftButton tone="danger" icon="cancel" label="Cancel Request" onPress={handleCancel} />
            )}

            {booking.status === 'confirmed' && (
              <SoftButton tone="danger" icon="cancel" label="Cancel Booking" onPress={handleCancel} />
            )}

          </View>
        </View>
      </ScrollView>

      <PastGigPriceModal
        visible={feeTarget != null}
        title={feeTarget?.price != null ? 'Edit fee' : 'Set fee'}
        confirmLabel="Save"
        artistName={feeTarget ? (getArtistUser(feeTarget.artistId)?.fullName ?? 'this artist') : 'this artist'}
        subtitle={`${bookingVenueName(booking, venue?.name)} · ${slot ? formatDate(slot.date) : (booking.slotDate ? formatDate(booking.slotDate) : '')}`}
        defaultPrice={feeTarget?.price}
        onCancel={() => setFeeTarget(null)}
        onConfirm={saveTargetFee}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  addArtistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  addArtistCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addArtistText: { fontSize: 15, fontWeight: '700' },
  detailSendPill: { height: 30, minWidth: 76, borderRadius: 9, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  detailSendPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Status chip sized + centred like the Send pill (middle-right, not top-right).
  statusChip: { alignSelf: 'center', height: 30, minWidth: 76, borderRadius: 9, paddingVertical: 0, justifyContent: 'center' },
  statusChipText: { fontSize: 13 },
  rowFee: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },   // tappable per-artist fee line
  rowFeeText: { fontSize: 13, fontWeight: '600' },
  rowFeeMuted: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  detailLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, width: 92 },
  detailValueWrap: { flex: 1 },
  detailValue: { fontSize: 14, lineHeight: 20 },
  content: {},
  bodyText: { fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mapsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  mapsBadgeText: { fontSize: 13, fontWeight: '700' },
  feeEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  feeEditText: { fontSize: 12, fontWeight: '700' },
  feeInvoiced: { fontSize: 12, fontWeight: '600' },
  reviewTitle: { fontSize: 16, fontWeight: '700' },
  reviewArtistName: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 6 },
  actions: { gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
