import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { EmptyState } from '@/components/ui/empty-state';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useAuthStore, useBookingStore, useSlotStore, useInvoiceStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { monthKey, monthLabel } from '@/lib/utils';

/** This artist's BOOKED (upcoming, confirmed) + COMPLETED gigs at one venue, grouped by month
 *  (newest first). Deliberately mirrors the manager's artist-profile Bookings tab
 *  (components/artist-bookings-list.tsx) — same status-coloured date tile (green = booked, slate =
 *  completed), fonts, "Invoiced" pill and month headers — scoped to one venue, so each row leads
 *  with the date (no venue name to repeat) and opens the artist booking detail. Flows inside the
 *  venue-detail ScrollView (a View, not its own scroller). */
export function ArtistVenueBookingsList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
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

  // Booked (confirmed, not yet completed) + completed — matches the manager's booked+completed view.
  const rows = useMemo(() => allBookings
    .filter((b) => b.artistId === currentUser?.id && b.venueId === venueId && (
      (b.status === 'completed' || b.isCompleted) || (b.status === 'confirmed' && !b.isCompleted)
    ))
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return {
        id: b.id,
        date: slot?.date ?? b.slotDate ?? '',
        startTime: slot?.startTime ?? b.slotStartTime ?? '',
        endTime: slot?.endTime ?? b.slotEndTime ?? '',
        done: b.status === 'completed' || b.isCompleted,
        isInvoiced: invoicedIds.has(b.id),
      };
    })
    .filter((r) => !!r.date)
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)), // newest first
    [allBookings, slots, venueId, currentUser?.id, invoicedIds]
  );

  // Group into months; `rows` is already newest-first so months come out newest-first too.
  const months = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: typeof rows }>();
    rows.forEach((r) => {
      const key = monthKey(r.date);
      let e = map.get(key);
      if (!e) { e = { key, label: monthLabel(r.date), items: [] }; map.set(key, e); }
      e.items.push(r);
    });
    return Array.from(map.values());
  }, [rows]);

  if (rows.length === 0) {
    return <EmptyState icon="event-note" title="No bookings yet" subtitle="Your booked and completed gigs at this venue show here." />;
  }

  return (
    <View style={styles.wrap}>
      {months.map((m) => (
        <View key={m.key}>
          <View style={styles.monthHeader}>
            <Text style={[styles.monthLabel, { color: colors.muted }]}>{m.label}</Text>
            <Text style={[styles.monthCount, { color: colors.muted }]}>{m.items.length} gig{m.items.length !== 1 ? 's' : ''}</Text>
          </View>
          {m.items.map((r) => {
            const color = r.done ? STATUS_COLORS.completed : STATUS_COLORS.confirmed;
            return (
              <Pressable
                key={r.id}
                style={({ pressed }) => [styles.bookingCard, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(artist)/booking-detail?id=' + r.id) as Href)}
              >
                <DateBadge dateStr={r.date} color={color} />
                <View style={styles.gigInfo}>
                  <Text style={[styles.bookingVenue, { color: colors.foreground }]} numberOfLines={1}>
                    {r.date ? formatDate(r.date) : 'Date unknown'}
                  </Text>
                  <Text style={[styles.bookingSub, { color: colors.muted }]} numberOfLines={1}>
                    {r.startTime ? `${formatTime(r.startTime)}–${formatTime(r.endTime)}` : ''}
                  </Text>
                </View>
                {r.isInvoiced ? (
                  <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                    <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Style values copied verbatim from components/artist-bookings-list.tsx (the manager's Bookings tab)
// so the two look identical; the row keeps its own paddingHorizontal like there (no wrap padding).
const styles = StyleSheet.create({
  wrap: { paddingTop: 8, paddingBottom: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  monthLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  monthCount: { fontSize: 12, fontWeight: '600' },
  bookingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  gigInfo: { flex: 1 },
  bookingVenue: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  bookingSub: { fontSize: 13 },
  invoicedChip: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  invoicedChipText: { fontSize: 11, fontWeight: '700' },
});
