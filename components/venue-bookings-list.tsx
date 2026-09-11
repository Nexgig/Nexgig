import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter, type Href } from 'expo-router';
import { EmptyState } from '@/components/ui/empty-state';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useAuthStore, useBookingStore, useSlotStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { monthKey, monthLabel } from '@/lib/utils';
import { formatDate, formatTime } from '@/lib/conflict-detection';

/** This venue's BOOKED (confirmed) + COMPLETED bookings, grouped by month (newest first).
 *  Booked rows are green, completed rows slate. Tapping a row opens the booking detail.
 *  Mirrors components/venue-invoices-list.tsx (the other venue-detail tab). */
export function VenueBookingsList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  const rows = useMemo(() => {
    return allBookings
      .filter((b) => b.venueId === venueId && b.managerId === currentUser?.id && (b.status === 'confirmed' || b.status === 'completed'))
      .map((b) => {
        const slot = slots.find((s) => s.id === b.slotId);
        const date = slot?.date ?? b.slotDate ?? '';
        const start = slot?.startTime ?? b.slotStartTime ?? '';
        const end = slot?.endTime ?? b.slotEndTime ?? '';
        const done = b.status === 'completed' || b.isCompleted;
        // Guest DJs carry a name (no artistId); a null artistId is someone who left the roster.
        const name = b.guestName
          ? b.guestName
          : b.artistId == null
            ? 'Former Artist'
            : (getArtistUser(b.artistId)?.fullName ?? 'Artist');
        return { b, date, start, end, done, name };
      })
      .filter((r) => !!r.date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
  }, [allBookings, slots, getArtistUser, currentUser?.id, venueId]);

  // Group into months; `rows` is already newest-first so the months come out newest-first too.
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
    return <EmptyState icon="event-note" title="No bookings yet" subtitle="Booked and completed gigs for this venue will show here." />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {months.map((m) => (
        <View key={m.key} style={{ marginBottom: 8 }}>
          <View style={styles.monthHeader}>
            <Text style={[styles.monthLabel, { color: colors.muted }]}>{m.label}</Text>
            <Text style={[styles.monthCount, { color: colors.muted }]}>{m.items.length} gig{m.items.length !== 1 ? 's' : ''}</Text>
          </View>
          {m.items.map((r) => {
            const c = r.done ? STATUS_COLORS.completed : STATUS_COLORS.confirmed;
            return (
              <Pressable
                key={r.b.id}
                style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/booking-detail?id=' + r.b.id) as Href)}
              >
                <DateBadge dateStr={r.date} color={c} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                    {formatDate(r.date)}{r.start ? ` · ${formatTime(r.start)}–${formatTime(r.end)}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: c + '1A' }]}>
                  <Text style={[styles.statusText, { color: c }]}>{r.done ? 'Completed' : 'Booked'}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, paddingTop: 6, paddingBottom: 8 },
  monthLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  monthCount: { fontSize: 12, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
});
