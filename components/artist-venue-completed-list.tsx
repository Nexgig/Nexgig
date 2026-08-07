import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { EmptyState } from '@/components/ui/empty-state';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useAuthStore, useBookingStore, useSlotStore, useInvoiceStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useFormatTime } from '@/lib/conflict-detection';

/** The gigs THIS artist has completed at one venue, newest first, with an "Invoiced" chip
 *  when the gig is already on a (non-cancelled) invoice. Flows inside the venue-detail ScrollView. */
export function ArtistVenueCompletedList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { formatTime: fmtTime } = useFormatTime();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const invoices = useInvoiceStore((s) => s.invoices);

  const invoicedIds = useMemo(
    () => new Set(invoices
      .filter((inv) => inv.artistId === currentUser?.id && inv.status !== 'cancelled')
      .flatMap((inv) => inv.gigs.map((g) => g.bookingId))),
    [invoices, currentUser?.id]
  );

  const gigs = useMemo(() => allBookings
    .filter((b) => b.artistId === currentUser?.id && b.venueId === venueId && (b.status === 'completed' || b.isCompleted))
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return {
        id: b.id,
        date: slot?.date ?? b.slotDate ?? '',
        startTime: slot?.startTime ?? b.slotStartTime ?? '',
        endTime: slot?.endTime ?? b.slotEndTime ?? '',
        isInvoiced: invoicedIds.has(b.id),
      };
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1)),
    [allBookings, slots, venueId, currentUser?.id, invoicedIds]
  );

  if (gigs.length === 0) {
    return <EmptyState icon="event-available" title="No completed gigs" subtitle="Gigs you've played at this venue show up here." />;
  }

  return (
    <View style={styles.wrap}>
      {gigs.map((g) => {
        const longDate = g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
        return (
          <Pressable
            key={g.id}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push(('/(artist)/booking-detail?id=' + g.id) as Href)}
          >
            <DateBadge dateStr={g.date} color={STATUS_COLORS.completed} />
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{longDate}</Text>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {g.startTime ? `${fmtTime(g.startTime)}–${fmtTime(g.endTime)}` : ''}
              </Text>
            </View>
            {g.isInvoiced && (
              <View style={[styles.chip, { backgroundColor: colors.primary + '1A' }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>Invoiced</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  time: { fontSize: 13, fontWeight: '500' },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
