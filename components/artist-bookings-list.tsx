import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useInvoiceStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { todayLocalStr, bookingVenueName } from '@/lib/utils';

type Tab = 'pending' | 'upcoming' | 'completed';

/**
 * A manager's bookings, split Pending / Upcoming / Completed, scoped either to ONE ARTIST
 * (pass artistId — shown on artist-profile-view) or to ONE VENUE (pass venueId — shown on
 * venue-detail's Bookings tab). Same layout both ways; only the row's primary label differs:
 * artist-scoped rows name the venue (frozen for completed gigs), venue-scoped rows name the
 * artist (the venue is fixed, so repeating it per row would be noise).
 *
 * Renders with .map(), NOT FlatList: the host is already inside a ScrollView, and a
 * VirtualizedList nested in one breaks scrolling and warns. One artist's (or one venue's)
 * gigs with one manager is short — virtualisation buys nothing.
 */
export function ArtistBookingsList({ artistId, venueId }: { artistId?: string; venueId?: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const [activeTab, setActiveTab] = useState<Tab>('pending');

  const byVenue = !!venueId;

  const scopedBookings = useMemo(
    () => allBookings.filter((b) =>
      b.managerId === currentUser?.id &&
      (artistId ? b.artistId === artistId : true) &&
      (venueId ? b.venueId === venueId : true)
    ),
    [allBookings, artistId, venueId, currentUser?.id]
  );

  // bookingId -> invoiceId on a live (non-cancelled) invoice — drives the clickable
  // "Invoiced" chip, which opens the invoice.
  const invoiceByBooking = useMemo(() => {
    const m = new Map<string, string>();
    allInvoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.status !== 'cancelled')
      .forEach((inv) => inv.gigs.forEach((g) => m.set(g.bookingId, inv.id)));
    return m;
  }, [allInvoices, currentUser?.id]);

  // Local date (not UTC) so a gig dated today doesn't drop out of Upcoming in the early
  // hours — toISOString would still read yesterday in Dubai (UTC+4).
  const today = todayLocalStr();

  const enriched = useMemo(() => scopedBookings.map((b) => {
    const slot = allSlots.find((s) => s.id === b.slotId);
    const venue = allVenues.find((v) => v.id === b.venueId);
    const resolvedSlot = slot ?? (b.slotDate ? {
      id: b.slotId, venueId: b.venueId, date: b.slotDate,
      name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
      endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
    } : undefined);
    const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
    return { ...b, slot: resolvedSlot, venue: resolvedVenue };
  }), [scopedBookings, allSlots, allVenues]);

  const pendingBookings = useMemo(() => enriched
    .filter((b) => b.status === 'requested' || b.status === 'past_confirmation')
    .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1), [enriched]);

  const upcomingBookings = useMemo(() => enriched
    .filter((b) => b.status === 'confirmed' && !b.isCompleted && (b.slot?.date ?? '') >= today)
    .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1), [enriched, today]);

  const completedBookings = useMemo(() => enriched
    .filter((b) => b.isCompleted || b.status === 'completed')
    .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1), [enriched]);

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'pending', label: 'Pending', count: pendingBookings.length, color: STATUS_COLORS.pending },
    { key: 'upcoming', label: 'Upcoming', count: upcomingBookings.length, color: STATUS_COLORS.confirmed },
    { key: 'completed', label: 'Completed', count: completedBookings.length, color: STATUS_COLORS.completed },
  ];

  const activeData =
    activeTab === 'pending' ? pendingBookings :
    activeTab === 'upcoming' ? upcomingBookings :
    completedBookings;

  const emptyIcon = activeTab === 'pending' ? 'schedule' : activeTab === 'upcoming' ? 'event-available' : 'check-circle';

  const primaryLabel = (item: typeof enriched[number]): string => {
    if (byVenue) {
      // Venue-scoped: name the artist. There's no artist-name snapshot on the booking, so
      // this is a live lookup — matches the completed-gigs convention: null id = a deleted
      // account, an unresolved id = not loaded.
      if (item.artistId == null) return 'Former Artist';
      return getArtistUser(item.artistId)?.fullName ?? 'Unknown Artist';
    }
    // Artist-scoped: name the venue, frozen for completed gigs.
    return bookingVenueName(item, item.venue?.name);
  };

  return (
    <View>
      {/* Status filter. Chips, not a second tab bar — the host already has one above,
          and two stacked bordered bars read as a mistake. */}
      <View style={styles.chipRow}>
        {tabs.map((tab) => {
          const on = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: on ? tab.color : colors.surface, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? '#FFFFFF' : colors.foreground }]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.chipCount, { backgroundColor: on ? '#FFFFFF30' : tab.color + '22' }]}>
                  <Text style={[styles.chipCountText, { color: on ? '#FFFFFF' : tab.color }]}>{tab.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {activeData.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialIcons name={emptyIcon} size={40} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>No {activeTab} bookings</Text>
        </View>
      ) : (
        activeData.map((item) => {
          const isDone = item.status === 'completed' || item.isCompleted;
          const isPending = item.status === 'requested' || item.status === 'past_confirmation';
          const color = isDone ? STATUS_COLORS.completed : isPending ? STATUS_COLORS.pending : STATUS_COLORS.confirmed;
          const invoiceId = invoiceByBooking.get(item.id);
          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.bookingCard, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/booking-detail?id=' + item.id) as Href)}
            >
              <DateBadge dateStr={item.slot?.date ?? item.slotDate} color={color} />
              <View style={styles.gigInfo}>
                <Text style={[styles.bookingVenue, { color: colors.foreground }]} numberOfLines={1}>
                  {primaryLabel(item)}
                </Text>
                <Text style={[styles.bookingSub, { color: colors.muted }]} numberOfLines={1}>
                  {item.slot?.date ? formatDate(item.slot.date) : 'Date unknown'}
                  {item.slot?.startTime && item.slot?.endTime
                    ? ` · ${formatTime(item.slot.startTime)}–${formatTime(item.slot.endTime)}`
                    : ''}
                </Text>
              </View>
              {/* Invoiced chip on the RIGHT and clickable — opens the invoice, matching the
                  Completed Gigs page. It used to sit inline by the name and did nothing. */}
              {invoiceId ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId } }); }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.invoicedChip, { backgroundColor: colors.primary + '1A', opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipCount: { borderRadius: 100, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  chipCountText: { fontSize: 10, fontWeight: '700' },
  bookingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  gigInfo: { flex: 1 },
  bookingVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  bookingSub: { fontSize: 13 },
  invoicedChip: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  invoicedChipText: { fontSize: 11, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14 },
});
