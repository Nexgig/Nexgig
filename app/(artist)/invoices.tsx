import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Modal, ScrollView, Alert } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore, useInvoiceStore, useInvoiceReminderStore, useNotificationStore } from '@/lib/store';
import { rescheduleInvoiceReminders } from '@/lib/invoice-reminders';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import type { Invoice } from '@/lib/types';

type Tab = 'new' | 'sent';

export default function InvoicesScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const slots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const allVenueAssignments = useLineupStore((s) => s.venueAssignments);
  const invoices = useInvoiceStore((s) => s.invoices);
  const getByArtist = useInvoiceStore((s) => s.getByArtist);
  const cancelInvoice = useInvoiceStore((s) => s.cancelInvoice);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const reminders = useInvoiceReminderStore((s) => s.reminders);
  const getReminder = useInvoiceReminderStore((s) => s.getReminder);
  const setReminder = useInvoiceReminderStore((s) => s.setReminder);

  const [tab, setTab] = useState<Tab>('new');
  const [reminderVenueId, setReminderVenueId] = useState<string | null>(null);
  const [reminderDay, setReminderDay] = useState(1);

  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const sentInvoices = useMemo(
    () => currentUser ? getByArtist(currentUser.id) : [],
    [invoices, currentUser]
  );

  // Get all venues where artist has completed OR confirmed gigs
  const artistVenues = useMemo(() => {
    if (!currentUser) return [];
    const invoiceableBookings = allBookings.filter(
      (b) =>
        b.artistId === currentUser.id &&
        ((b.isCompleted && b.status === 'completed') ||
          (b.status === 'confirmed' && !b.isCompleted))
    );
    const venueIds = [...new Set(invoiceableBookings.map((b) => b.venueId))];
    return venueIds.map((vid) => {
      // Fall back to the booking's venueName snapshot when the venue isn't in the
      // store (manager deleted/hid it, or the artist left it). The gig was still
      // performed, so it must stay invoiceable — never drop it from the list.
      const liveVenue = allVenues.find((v) => v.id === vid);
      const snapshotName = invoiceableBookings.find((b) => b.venueId === vid)?.venueName;
      const venue = liveVenue ?? (snapshotName
        ? ({ id: vid, name: snapshotName, color: '#2563EB' } as typeof allVenues[number])
        : undefined);
      // Count uninvoiced gigs: completed or confirmed, not yet in any ACTIVE sent
      // invoice. Cancelled invoices are excluded so their gigs become invoiceable
      // again (the artist can re-invoice them).
      const invoicedBookingIds = new Set(
        invoices
          .filter((inv) => inv.venueId === vid && inv.artistId === currentUser.id && inv.status !== 'cancelled')
          .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
      );
      const uninvoicedCount = invoiceableBookings.filter(
        (b) => b.venueId === vid && !invoicedBookingIds.has(b.id)
      ).length;
      return { venue, venueId: vid, uninvoicedCount };
    }).filter((v) => v.venue);
  }, [allBookings, allVenues, currentUser, invoices]);

  const getVenueBadge = useCallback((venueId: string) => {
    if (!currentUser) return 'none';
    // Read reactively from reminders array so badge updates when reminder changes
    const reminderEntry = reminders.find((r) => r.venueId === venueId && r.artistId === currentUser.id);
    const reminder = reminderEntry?.reminderDay ?? 1;
    // Check if invoice was already sent this month for this venue
    const sentThisMonth = sentInvoices.some((inv) => {
      const d = new Date(inv.sentAt);
      return inv.venueId === venueId && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    if (sentThisMonth) return 'green';
    if (currentDay > reminder) return 'red';
    if (currentDay === reminder) return 'orange';
    return 'none';
  }, [currentUser, reminders, sentInvoices, currentDay, currentMonth, currentYear]);

  const renderVenueCard = ({ item }: { item: typeof artistVenues[0] }) => {
    if (!item.venue || !currentUser) return null;
    // Read reactively from reminders array so card re-renders when reminder changes
    const reminderEntry = reminders.find((r) => r.venueId === item.venueId && r.artistId === currentUser.id);
    const reminder = reminderEntry?.reminderDay ?? 1;
    const badge = getVenueBadge(item.venueId);
    return (
      <Pressable
        style={({ pressed }) => [styles.venueCard, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => router.push(`/(artist)/invoice-gigs?venueId=${item.venueId}` as Href)}
      >
        <View style={[styles.venueColorBar, { backgroundColor: item.venue.color }]} />
        <View style={styles.venueInfo}>
          <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{item.venue.name}</Text>
          <Text style={[styles.venueReminder, { color: colors.muted }]}>Reminder: {reminder}{getOrdinalSuffix(reminder)} of each month</Text>
        </View>
        {/* Uninvoiced gig count where dot used to be */}
        {item.uninvoicedCount > 0 && (
          <View style={[styles.uninvoicedBadge, { backgroundColor: badge === 'red' ? colors.error + '18' : colors.warning + '18' }]}>
            <Text style={[styles.uninvoicedText, { color: badge === 'red' ? colors.error : colors.warning }]}>{item.uninvoicedCount}</Text>
          </View>
        )}
        {/* Dot removed — uninvoiced count badge is sufficient */}
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
      </Pressable>
    );
  };

  // ── Cancel a sent invoice (soft cancel) ──
  // Flips the invoice to 'cancelled' on both sides, frees up its gigs to be
  // re-invoiced, and notifies the manager. No hard delete — both sides keep a
  // visible CANCELLED record (audit trail).
  const handleCancelInvoice = useCallback((inv: Invoice) => {
    Alert.alert(
      'Cancel Invoice',
      `Cancel invoice ${inv.invoiceNumber} for ${inv.venueName}? The manager will be notified and the gigs on it will become available to invoice again.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Invoice',
          style: 'destructive',
          onPress: () => {
            cancelInvoice(inv.id);
            // Notify the manager.
            const artistName = currentUser?.fullName ?? 'The artist';
            addNotification({
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: inv.managerId,
              type: 'invoice_cancelled',
              title: 'Invoice Cancelled',
              body: `${artistName} cancelled invoice ${inv.invoiceNumber} · ${inv.venueName}`,
              isRead: false,
              relatedId: inv.id,
              relatedType: 'invoice',
              createdAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  }, [cancelInvoice, addNotification, currentUser]);

  const renderSentInvoice = ({ item }: { item: Invoice }) => {
    const sentDate = new Date(item.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const isCancelled = item.status === 'cancelled';
    return (
      <Pressable
        style={({ pressed }) => [styles.sentCard, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => router.push(`/(artist)/invoice-preview?invoiceId=${item.id}&readOnly=1` as Href)}
      >
        <View style={styles.sentCardTop}>
          <View style={styles.sentCardLeft}>
            <Text style={[styles.sentInvoiceNumber, { color: isCancelled ? colors.muted : colors.primary }]}>{item.invoiceNumber}</Text>
            <Text style={[styles.sentVenue, { color: colors.foreground, textDecorationLine: isCancelled ? 'line-through' : 'none' }]} numberOfLines={1}>{item.venueName}</Text>
            <Text style={[styles.sentDate, { color: colors.muted }]}>
              {item.gigs.length} gig{item.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}
            </Text>
          </View>
          <View style={styles.sentCardRight}>
            <Text style={[styles.sentAmount, { color: isCancelled ? colors.muted : colors.primary, textDecorationLine: isCancelled ? 'line-through' : 'none' }]}>AED {item.totalAmount.toLocaleString()}</Text>
          </View>
        </View>
        {/* Bottom row: CANCELLED badge (left) + three-dots menu (right) */}
        <View style={styles.sentCardBottom}>
          {isCancelled ? (
            <View style={[styles.cancelledBadge, { backgroundColor: colors.error + '18' }]}>
              <Text style={[styles.cancelledBadgeText, { color: colors.error }]}>CANCELLED</Text>
            </View>
          ) : <View />}
          {!isCancelled && (
            <Pressable
              style={({ pressed }) => [styles.dotsBtn, { opacity: pressed ? 0.5 : 1 }]}
              onPress={(e) => { e.stopPropagation?.(); handleCancelInvoice(item); }}
              hitSlop={10}
            >
              <MaterialIcons name="more-horiz" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(artist)/(tabs)/dashboard' as any);
            }
          }}
          // canGoBack() handles both normal nav and post-send nav correctly
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Invoices</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(['new', 'sent'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.muted, fontWeight: tab === t ? '700' : '500' }]}>
              {t === 'new' ? 'New Invoice' : 'Sent'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'new' ? (
        <FlatList
        ItemSeparatorComponent={() => <Divider full />}
          data={artistVenues}
          keyExtractor={(item) => item.venueId}
          renderItem={renderVenueCard}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="receipt-long" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No gigs to invoice yet</Text>
            </View>
          }
        />
      ) : (
        <FlatList
        ItemSeparatorComponent={() => <Divider full />}
          data={sentInvoices}
          keyExtractor={(item) => item.id}
          renderItem={renderSentInvoice}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="receipt-long" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>No invoices sent yet</Text>
            </View>
          }
        />
      )}

      {/* Reminder Day Picker Modal */}
      <Modal visible={!!reminderVenueId} transparent animationType="fade" onRequestClose={() => setReminderVenueId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReminderVenueId(null)}>
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
                if (reminderVenueId && currentUser) {
                  setReminder(reminderVenueId, currentUser.id, reminderDay);
                  setReminderVenueId(null);
                  // Re-arm local invoice reminders so the new day takes effect.
                  rescheduleInvoiceReminders(currentUser.id);
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

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  venueCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  venueColorBar: { width: 4, height: 44, borderRadius: 2 },
  venueInfo: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  venueReminder: { fontSize: 11 },
  uninvoicedBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, minWidth: 24, alignItems: 'center' },
  uninvoicedText: { fontSize: 12, fontWeight: '700' },
  badgeDot: { width: 10, height: 10, borderRadius: 5 },
  sentCard: { paddingVertical: 12 },
  sentCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sentCardLeft: { flex: 1, gap: 3 },
  sentInvoiceNumber: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sentVenue: { fontSize: 15, fontWeight: '700' },
  sentDate: { fontSize: 12 },
  sentCardRight: { alignItems: 'flex-end' },
  sentAmount: { fontSize: 15, fontWeight: '800', fontFamily: fonts.bodyBold },
  sentCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, minHeight: 24 },
  cancelledBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  cancelledBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dotsBtn: { padding: 2, marginLeft: 'auto' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14 },
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
