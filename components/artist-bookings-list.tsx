import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useInvoiceStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { todayLocalStr } from '@/lib/utils';

type Tab = 'pending' | 'upcoming' | 'completed';

/**
 * One artist's bookings WITH THE CURRENT MANAGER, split Pending / Upcoming / Completed.
 *
 * Extracted from the old app/(manager)/artist-bookings.tsx screen so it can live as a
 * tab on artist-profile-view instead of its own route.
 *
 * Renders with .map(), NOT FlatList: the host is already inside a ScrollView, and a
 * VirtualizedList nested in one breaks scrolling and warns. The list is one artist's
 * gigs with one manager, so it's short — virtualisation buys nothing here.
 */
export function ArtistBookingsList({ artistId }: { artistId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const [activeTab, setActiveTab] = useState<Tab>('pending');

  const artistBookings = useMemo(
    () => allBookings.filter((b) => b.artistId === artistId && b.managerId === currentUser?.id),
    [allBookings, artistId, currentUser?.id]
  );

  // Booking ids on a live (non-cancelled) invoice — drives the "Invoiced" chip.
  const invoicedBookingIds = useMemo(() => new Set(
    allInvoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
  ), [allInvoices, currentUser?.id]);

  // Local date (not UTC) so a gig dated today doesn't drop out of Upcoming in the early
  // hours — toISOString would still read yesterday in Dubai (UTC+4).
  const today = todayLocalStr();

  const enriched = useMemo(() => artistBookings.map((b) => {
    const slot = allSlots.find((s) => s.id === b.slotId);
    const venue = allVenues.find((v) => v.id === b.venueId);
    const resolvedSlot = slot ?? (b.slotDate ? {
      id: b.slotId, venueId: b.venueId, date: b.slotDate,
      name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
      endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
    } : undefined);
    const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
    return { ...b, slot: resolvedSlot, venue: resolvedVenue };
  }), [artistBookings, allSlots, allVenues]);

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
          const isInvoiced = invoicedBookingIds.has(item.id);
          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.bookingCard, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/booking-detail?id=' + item.id) as Href)}
            >
              <DateBadge dateStr={item.slot?.date ?? item.slotDate} color={color} />
              <View style={styles.gigInfo}>
                <View style={styles.titleRow}>
                  <Text style={[styles.bookingVenue, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                    {item.venue?.name ?? item.venueName ?? 'Unknown Venue'}
                  </Text>
                  {isInvoiced && (
                    <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                      <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.bookingSub, { color: colors.muted }]} numberOfLines={1}>
                  {item.slot?.date ? formatDate(item.slot.date) : 'Date unknown'}
                  {item.slot?.startTime && item.slot?.endTime
                    ? ` · ${formatTime(item.slot.startTime)}–${formatTime(item.slot.endTime)}`
                    : ''}
                </Text>
              </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookingVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  bookingSub: { fontSize: 13 },
  invoicedChip: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  invoicedChipText: { fontSize: 10, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14 },
});
