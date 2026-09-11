import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore, useLineupStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import { groupByCycle } from '@/lib/billing-cycle';

/** All invoices sent to this manager FOR one venue, grouped by the venue's BILLING CYCLE (the
 *  cycle the invoice's LAST gig falls in — so an invoice is filed under when the work happened).
 *  Each cycle header shows that cycle's total. Rows name the artist. */

/** Latest gig date (YYYY-MM-DD) on an invoice; falls back to the sent date if it has no gigs. */
function lastGigDate(inv: { gigs: { date: string }[]; sentAt: string }): string {
  const dates = (inv.gigs ?? []).map((g) => g.date).filter(Boolean);
  if (dates.length === 0) return (inv.sentAt ?? '').slice(0, 10);
  return dates.reduce((a, b) => (a > b ? a : b));
}
export function VenueInvoicesList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const venue = useVenueStore((s) => s.getVenueById(venueId));

  // The venue's billing cycle drives the section titles (default 31 = a normal calendar month).
  const [cycleEndDay, setCycleEndDay] = useState<number | null>(venue?.billingCycleEndDay ?? null);
  useEffect(() => {
    if (venue?.billingCycleEndDay != null) { setCycleEndDay(venue.billingCycleEndDay); return; }
    let alive = true;
    supabase.from('venues').select('billing_cycle_end_day').eq('id', venueId).maybeSingle()
      .then(({ data, error }) => { if (alive) setCycleEndDay(error || data?.billing_cycle_end_day == null ? 31 : Number(data.billing_cycle_end_day)); });
    return () => { alive = false; };
  }, [venueId, venue?.billingCycleEndDay]);
  const effectiveCycleDay = cycleEndDay ?? 31;

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.venueId === venueId && !inv.isDeletedByManager)
      .sort((a, b) => lastGigDate(b).localeCompare(lastGigDate(a))),
    [invoices, currentUser?.id, venueId]
  );

  // Group by the venue's BILLING CYCLE the last gig falls in (newest cycle first). `total` sums the
  // cycle's non-cancelled invoices. cycleForDate labels a whole calendar month as "August 2025" and
  // a shifted cycle as "16 Jul – 15 Aug 2025".
  const cycles = useMemo(
    () => groupByCycle(list, (inv) => lastGigDate(inv), effectiveCycleDay).map((g) => ({
      key: g.cycle.key,
      label: g.cycle.label,
      items: g.items,
      total: g.items.reduce((sum, inv) => sum + (inv.status !== 'cancelled' ? inv.totalAmount : 0), 0),
    })),
    [list, effectiveCycleDay]
  );

  if (list.length === 0) {
    return <EmptyState icon="receipt-long" title="No invoices" subtitle="No invoices have been sent for this venue yet." />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {cycles.map((m) => (
        <View key={m.key} style={{ marginBottom: 8 }}>
          <View style={styles.monthHeader}>
            <Text style={[styles.monthLabel, { color: colors.muted }]}>{m.label}</Text>
            <Text style={[styles.monthTotal, { color: colors.foreground }]}>AED {m.total.toLocaleString()}</Text>
          </View>
          {m.items.map((inv) => {
            const sentDate = new Date(inv.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            const cancelled = inv.status === 'cancelled';
            const artistName = getArtistUser(inv.artistId)?.fullName ?? inv.artistLegalName ?? 'Artist';
            return (
              <Pressable
                key={inv.id}
                style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId: inv.id } })}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.foreground, textDecorationLine: cancelled ? 'line-through' : 'none' }]} numberOfLines={1}>{artistName}</Text>
                    {!inv.isReadByManager && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                    {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}{inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ''}{inv.pdfUrl ? ' · Uploaded' : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={[styles.amount, { color: cancelled ? colors.muted : colors.primary, textDecorationLine: cancelled ? 'line-through' : 'none' }]}>AED {inv.totalAmount.toLocaleString()}</Text>
                  {cancelled && <Text style={[styles.cancelled, { color: colors.error }]}>CANCELLED</Text>}
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
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
  monthTotal: { fontSize: 13, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
