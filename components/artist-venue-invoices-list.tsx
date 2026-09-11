import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { monthKey, monthLabel } from '@/lib/utils';

/** Latest gig date (YYYY-MM-DD) on an invoice; falls back to the sent date if it has no gigs. */
function lastGigDate(inv: { gigs: { date: string }[]; sentAt: string }): string {
  const dates = (inv.gigs ?? []).map((g) => g.date).filter(Boolean);
  if (dates.length === 0) return (inv.sentAt ?? '').slice(0, 10);
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** The invoices THIS artist has sent for one venue, grouped by month (of the invoice's last gig),
 *  newest first. Tapping opens the read-only invoice. Flows inside the venue-detail ScrollView. */
export function ArtistVenueInvoicesList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.artistId === currentUser?.id && inv.venueId === venueId)
      .sort((a, b) => lastGigDate(b).localeCompare(lastGigDate(a))),
    [invoices, currentUser?.id, venueId]
  );

  // Group by the month of the last gig (newest month first — `list` is already sorted that way).
  const months = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: typeof list; total: number }>();
    list.forEach((inv) => {
      const d = lastGigDate(inv);
      const key = monthKey(d);
      let e = map.get(key);
      if (!e) { e = { key, label: monthLabel(d), items: [], total: 0 }; map.set(key, e); }
      e.items.push(inv);
      if (inv.status !== 'cancelled') e.total += inv.totalAmount;
    });
    return Array.from(map.values());
  }, [list]);

  if (list.length === 0) {
    return <EmptyState icon="receipt-long" title="No invoices sent" subtitle="Invoices you send for this venue show up here." />;
  }

  return (
    <View style={styles.wrap}>
      {months.map((m) => (
        <View key={m.key}>
          <View style={styles.monthHeader}>
            <Text style={[styles.monthLabel, { color: colors.muted }]}>{m.label}</Text>
            <Text style={[styles.monthTotal, { color: colors.foreground }]}>AED {m.total.toLocaleString()}</Text>
          </View>
          {m.items.map((inv) => {
            const sentDate = new Date(inv.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const cancelled = inv.status === 'cancelled';
            return (
              <Pressable
                key={inv.id}
                style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(`/(artist)/invoice-preview?invoiceId=${inv.id}&readOnly=1` as Href)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.num, { color: cancelled ? colors.muted : colors.foreground, textDecorationLine: cancelled ? 'line-through' : 'none' }]} numberOfLines={1}>{inv.invoiceNumber}</Text>
                  <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                    {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}{inv.pdfUrl ? ' · Uploaded' : ''}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, paddingTop: 6, paddingBottom: 8 },
  monthLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  monthTotal: { fontSize: 13, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  num: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
});
