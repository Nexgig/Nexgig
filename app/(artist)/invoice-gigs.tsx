import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Alert, Modal, ScrollView } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useInvoiceStore, useInvoiceReminderStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, useFormatTime } from '@/lib/conflict-detection';
import type { Booking, Slot } from '@/lib/types';

interface GigRow {
  booking: Booking;
  slot: Slot | undefined;
  selected: boolean;
  price: string;
}

type ListItem =
  | { type: 'header'; label: string }
  | { type: 'gig'; data: GigRow };

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** Returns "Monday, 12 May" style title from a date string */
function getDayDateTitle(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  const date = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  return `${day}, ${date}`;
}

export default function InvoiceGigsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { formatTime: fmtTime } = useFormatTime();
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const venue = useVenueStore((s) => s.getVenueById(venueId));
  // Fall back to the booking's snapshot name when the venue isn't in the store
  // (manager deleted/hid it, or the artist left it).
  const venueName = venue?.name
    ?? allBookings.find((b) => b.venueId === venueId && !!b.venueName)?.venueName
    ?? 'Venue';
  const invoices = useInvoiceStore((s) => s.invoices);
  const getReminder = useInvoiceReminderStore((s) => s.getReminder);
  const setReminder = useInvoiceReminderStore((s) => s.setReminder);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDay, setReminderDay] = useState(() =>
    currentUser && venueId ? getReminder(venueId, currentUser.id) : 1
  );

  // Build set of already-invoiced booking IDs for this venue/artist. Cancelled
  // invoices are excluded so their gigs become available to invoice again.
  const invoicedBookingIds = useMemo(() => {
    if (!currentUser || !venueId) return new Set<string>();
    return new Set(
      invoices
        .filter((inv) => inv.venueId === venueId && inv.artistId === currentUser.id && inv.status !== 'cancelled')
        .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
    );
  }, [invoices, currentUser, venueId]);

  // Completed gigs (status=completed, isCompleted=true), excluding already-invoiced
  const completedGigsSource = useMemo(() => {
    if (!currentUser || !venueId) return [];
    return allBookings
      .filter(
        (b) =>
          b.artistId === currentUser.id &&
          b.venueId === venueId &&
          b.isCompleted &&
          b.status === 'completed' &&
          !invoicedBookingIds.has(b.id)
      )
      .sort((a, b) => (a.slotDate ?? '').localeCompare(b.slotDate ?? ''));
  }, [allBookings, currentUser, venueId, invoicedBookingIds]);

  const [completedGigRows, setCompletedGigRows] = useState<GigRow[]>(() =>
    completedGigsSource.map((b) => ({
      booking: b,
      slot: slots.find((s) => s.id === b.slotId),
      selected: true,
      price: '',
    }))
  );

  // Re-sync row state when the source list changes. The useState initializer only
  // runs on mount, so if bookings/slots are still loading on the first render the
  // list would stay empty forever. Preserves selection + typed price across
  // updates, adds newly-arrived bookings, drops ones that just got invoiced.
  const completedKey = useMemo(() => completedGigsSource.map((b) => b.id).join(','), [completedGigsSource]);
  useEffect(() => {
    setCompletedGigRows((prev) => {
      const byId = new Map(prev.map((r) => [r.booking.id, r]));
      return completedGigsSource.map((b) => {
        const existing = byId.get(b.id);
        return existing
          ? { ...existing, booking: b, slot: slots.find((s) => s.id === b.slotId) }
          : { booking: b, slot: slots.find((s) => s.id === b.slotId), selected: true, price: '' };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  const toggleGig = useCallback((bookingId: string) => {
    setCompletedGigRows((prev) =>
      prev.map((g) => (g.booking.id === bookingId ? { ...g, selected: !g.selected } : g))
    );
  }, []);

  const updatePrice = useCallback((bookingId: string, price: string) => {
    const cleaned = price.replace(/[^0-9.]/g, '');
    setCompletedGigRows((prev) =>
      prev.map((g) => (g.booking.id === bookingId ? { ...g, price: cleaned } : g))
    );
  }, []);

  const allGigRows = completedGigRows;
  const selectedGigs = allGigRows.filter((g) => g.selected);
  const total = selectedGigs.reduce((sum, g) => sum + (parseFloat(g.price) || 0), 0);
  const allPriced = selectedGigs.every((g) => parseFloat(g.price) > 0);

  // Only completed gigs are invoiceable, so there is a single unlabelled section.
  const listData = useMemo(
    (): ListItem[] => completedGigRows.map((g) => ({ type: 'gig', data: g })),
    [completedGigRows]
  );

  const handleContinue = () => {
    if (selectedGigs.length === 0) {
      Alert.alert('No Gigs Selected', 'Please select at least one gig to invoice.');
      return;
    }
    if (!allPriced) {
      Alert.alert('Missing Prices', 'Please enter a price (AED) for all selected gigs.');
      return;
    }
    const gigsData = selectedGigs.map((g) => ({
      bookingId: g.booking.id,
      date: g.booking.slotDate || g.slot?.date || '',
      startTime: g.slot?.startTime ?? g.booking.slotStartTime ?? '',
      endTime: g.slot?.endTime ?? g.booking.slotEndTime ?? '',
      price: parseFloat(g.price),
    }));
    const refBooking = selectedGigs[0]?.booking;
    router.push({
      pathname: '/(artist)/invoice-preview' as any,
      params: {
        venueId,
        gigsJson: JSON.stringify(gigsData),
        total: total.toString(),
        // Carry the manager + venue name from the booking snapshot so the invoice is
        // complete even when the venue is no longer in the artist's store.
        managerId: refBooking?.managerId ?? '',
        venueName,
      },
    });
  };

  const renderGigRow = (item: GigRow) => {
    // Use booking.slotDate first (set on completed gigs), fall back to slot.date (for confirmed gigs)
    const dateStr = item.booking.slotDate || item.slot?.date || '';
    const dayDateTitle = dateStr ? getDayDateTitle(dateStr) : 'Gig';
    const timeStr = item.slot
      ? `${fmtTime(item.slot.startTime)} – ${fmtTime(item.slot.endTime)}`
      : '';
    // Same test the Preview Invoice CTA uses, so the border never disagrees with it.
    const isPriced = parseFloat(item.price) > 0;
    return (
      <View key={item.booking.id} style={styles.gigRow}>
        <Pressable
          style={({ pressed }) => [styles.checkbox, { borderColor: item.selected ? colors.primary : colors.border, backgroundColor: item.selected ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 }]}
          onPress={() => toggleGig(item.booking.id)}
        >
          {item.selected && <MaterialIcons name="check" size={16} color="#fff" />}
        </Pressable>
        <View style={styles.gigInfo}>
          <Text style={[styles.gigName, { color: colors.foreground }]} numberOfLines={1}>
            {dayDateTitle}
          </Text>
          {!!timeStr && <Text style={[styles.gigTime, { color: colors.muted }]}>{timeStr}</Text>}
        </View>
        <View style={styles.priceCol}>
          <Text style={[styles.priceLabel, { color: colors.muted }]}>AED</Text>
          <TextInput
            style={[styles.priceInput, { backgroundColor: colors.background, borderColor: isPriced ? colors.success : item.selected ? colors.primary : colors.border, color: colors.foreground }]}
            placeholder="0"
            placeholderTextColor={colors.muted}
            value={item.price}
            onChangeText={(v) => updatePrice(item.booking.id, v)}
            keyboardType="decimal-pad"
            returnKeyType="done"
            editable={item.selected}
          />
        </View>
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>{item.label}</Text>
      );
    }
    // Hairline only *between* consecutive gigs, so a section's last row has no
    // trailing divider butting up against the next section header.
    const prev = listData[index - 1];
    return (
      <>
        {prev && prev.type === 'gig' ? <Divider full /> : null}
        {renderGigRow(item.data)}
      </>
    );
  };

  const currentReminder = currentUser && venueId ? getReminder(venueId, currentUser.id) : 1;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{venueName}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Select gigs & enter prices</Text>
        </View>
        {/* Bell icon */}
        <Pressable
          style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => {
            setReminderDay(currentReminder);
            setShowReminderModal(true);
          }}
          hitSlop={8}
        >
          <MaterialIcons name="notifications" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, index) =>
          item.type === 'header' ? `header-${item.label}` : `gig-${item.data.booking.id}`
        }
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="check-circle" size={48} color={colors.success} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>All gigs have been invoiced</Text>
          </View>
        }
      />

      {/* Bottom bar */}
      {allGigRows.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.muted }]}>Total ({selectedGigs.length} gig{selectedGigs.length !== 1 ? 's' : ''})</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>AED {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.continueBtn, { opacity: pressed ? 0.85 : 1, backgroundColor: selectedGigs.length > 0 && allPriced ? '#E2674A' : colors.border }]}
            onPress={handleContinue}
            disabled={selectedGigs.length === 0 || !allPriced}
          >
            <Text style={styles.continueBtnText}>Preview Invoice</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Reminder Day Picker Modal */}
      <Modal visible={showReminderModal} transparent animationType="fade" onRequestClose={() => setShowReminderModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowReminderModal(false)}>
          <Pressable style={[styles.reminderSheet, { backgroundColor: colors.background }]} onPress={() => {}}>
            <View style={[styles.reminderHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reminderTitle, { color: colors.foreground }]}>Invoice Reminder Day</Text>
            <Text style={[styles.reminderDesc, { color: colors.muted }]}>Get reminded on this day each month to send your invoice.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayGrid}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <Pressable
                  key={d}
                  style={[styles.dayBtn, { backgroundColor: reminderDay === d ? colors.primary : colors.surface, borderColor: reminderDay === d ? colors.primary : colors.border }]}
                  onPress={() => setReminderDay(d)}
                >
                  <Text style={[styles.dayBtnText, { color: reminderDay === d ? '#fff' : colors.foreground }]}>{d}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={({ pressed }) => [styles.saveReminderBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => {
                if (venueId && currentUser) {
                  setReminder(venueId, currentUser.id, reminderDay);
                  setShowReminderModal(false);
                }
              }}
            >
              <Text style={styles.saveReminderBtnText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12 },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  sectionHeader: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  gigRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gigInfo: { flex: 1 },
  gigName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  gigTime: { fontSize: 11 },
  priceCol: { alignItems: 'center', gap: 2 },
  priceLabel: { fontSize: 10, fontWeight: '600' },
  priceInput: { width: 80, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 0.5 },
  totalLabel: { fontSize: 12 },
  totalValue: { fontSize: 20, fontWeight: '800', fontFamily: fonts.bodyBold },
  continueBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  continueBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  reminderSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  reminderHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  reminderTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  reminderDesc: { fontSize: 13, marginBottom: 16 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
  dayBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dayBtnText: { fontSize: 14, fontWeight: '600' },
  saveReminderBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveReminderBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
