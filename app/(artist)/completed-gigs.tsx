import { bookingVenueName } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from '@/lib/rn';
import { VenueFilterRow } from '@/components/venue-filter-row';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuthStore, useVenueStore, useBookingStore, useSlotStore, useInvoiceStore, useInvoiceReminderStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { DateBadge, STATUS_COLORS } from '@/components/ui/date-badge';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';

export default function ArtistCompletedGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const bookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);

  const allInvoices = useInvoiceStore((s) => s.invoices);
  const getReminder = useInvoiceReminderStore((s) => s.getReminder);

  // Overdue-invoice red dot on the invoice button. Moved here with the button from the
  // calendar header: a venue has completed gigs, its monthly reminder day has passed,
  // and no invoice was sent this month.
  const hasOverdueInvoice = useMemo(() => {
    if (!currentUser) return false;
    const today = new Date();
    const currentDay = today.getDate();
    const month = today.getMonth();
    const year = today.getFullYear();
    const completed = bookings.filter((b) => b.artistId === currentUser.id && b.isCompleted && b.status === 'completed');
    const venueIds = [...new Set(completed.map((b) => b.venueId))];
    return venueIds.some((vid) => {
      const reminder = getReminder(vid, currentUser.id);
      const sentThisMonth = allInvoices.some((inv) => {
        const d = new Date(inv.sentAt);
        return inv.venueId === vid && inv.artistId === currentUser.id && d.getMonth() === month && d.getFullYear() === year;
      });
      return !sentThisMonth && currentDay > reminder;
    });
  }, [bookings, allInvoices, currentUser, getReminder]);

  // bookingId -> invoiceId, so the "Invoiced" chip can open the actual invoice.
  const invoiceByBooking = useMemo(() => {
    const m = new Map<string, string>();
    allInvoices
      .filter((inv) => inv.artistId === currentUser?.id && inv.status !== 'cancelled')
      .forEach((inv) => inv.gigs.forEach((g) => m.set(g.bookingId, inv.id)));
    return m;
  }, [allInvoices, currentUser?.id]);

  // Completed gigs — with slot/venue snapshot fallback. The artist's local store may not
  // hold the manager's slots, so fall back to the slotDate/slotName/... fields stored on
  // the booking record itself (same pattern as the dashboard/profile).
  const completedGigs = useMemo(() => bookings
    .filter((b) => b.artistId === currentUser?.id && (b.status === 'completed' || b.isCompleted))
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      const venue = allVenues.find((v) => v.id === b.venueId) ?? (b.venueName ? { id: b.venueId, name: b.venueName } as any : undefined);
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId,
        venueId: b.venueId,
        date: b.slotDate,
        name: b.slotName ?? '',
        startTime: b.slotStartTime ?? '',
        endTime: b.slotEndTime ?? '',
        createdAt: b.createdAt,
      } : undefined);
      // Completed gigs are history — freeze to the booking's snapshot name (bookingVenueName).
      const resolvedVenueName = bookingVenueName(b, venue?.name);
      return { ...b, slot: resolvedSlot, resolvedVenueName, venue, isInvoiced: invoiceByBooking.has(b.id) || !!b.manuallyInvoiced, invoiceId: invoiceByBooking.get(b.id) };
    })
    .sort((a, b) => ((a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1)),
    [bookings, currentUser?.id, slots, allVenues, invoiceByBooking]
  );

  const [venueFilter, setVenueFilter] = useState<string | null>(null);
  const venueChips = useMemo(() => {
    const m = new Map<string, string>();
    completedGigs.forEach((b) => { if (b.venueId) m.set(b.venueId, b.resolvedVenueName); });
    return [...m].map(([id, name]) => ({ id, name }));
  }, [completedGigs]);
  const shownGigs = useMemo(
    () => venueFilter ? completedGigs.filter((b) => b.venueId === venueFilter) : completedGigs,
    [completedGigs, venueFilter]
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Completed Gigs</Text>
        {/* Invoices — moved here from the calendar header. */}
        <Pressable
          style={({ pressed }) => [styles.invoiceBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push('/(artist)/invoices' as Href)}
          hitSlop={8}
        >
          <MaterialIcons name="receipt-long" size={22} color={colors.primary} />
          {hasOverdueInvoice && (
            <View style={[styles.invoiceBadge, { borderColor: colors.background }]} />
          )}
        </Pressable>
      </View>

      <VenueFilterRow venues={venueChips} selectedId={venueFilter} onSelect={setVenueFilter} />

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={shownGigs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="check-circle" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Completed Gigs</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Completed bookings will appear here</Text>
          </View>
        }
        renderItem={({ item: booking }) => {
          return (
          <Pressable
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
          >
            <DateBadge dateStr={booking.slot?.date ?? booking.slotDate} color={STATUS_COLORS.completed} />
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <Text style={[styles.venueName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                  {booking.resolvedVenueName}
                </Text>
              </View>
              <Text style={[styles.time, { color: colors.muted }]} numberOfLines={1}>
                {booking.slot
                  ? `${formatDate(booking.slot.date)} · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}`
                  : ''}
              </Text>
            </View>
            {booking.isInvoiced && (
              booking.invoiceId ? (
                <Pressable
                  onPress={() => router.push((`/(artist)/invoice-preview?invoiceId=${booking.invoiceId}&readOnly=1`) as Href)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.invoicedChip, { backgroundColor: colors.primary + '1A', opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                </Pressable>
              ) : (
                // Manually marked invoiced (billed outside the app) — no invoice to open.
                <View style={[styles.invoicedChip, { backgroundColor: colors.primary + '1A' }]}>
                  <Text style={[styles.invoicedChipText, { color: colors.primary }]}>Invoiced</Text>
                </View>
              )
            )}
          </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 36, alignItems: 'flex-start' },
  invoiceBtn: { width: 36, height: 36, alignItems: 'flex-end', justifyContent: 'center' },
  invoiceBadge: { position: 'absolute', top: 2, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#E2674A', borderWidth: 2 },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingVertical: 8, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  invoicedChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0, marginLeft: 6 },
  invoicedChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  venueName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  time: { fontSize: 13 },
  statusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  statusMark: { width: 11, height: 11, borderRadius: 5.5, marginLeft: 6 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
