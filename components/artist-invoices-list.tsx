import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { monthLabel } from '@/lib/utils';

/** All invoices a single artist has sent to this manager, grouped by VENUE (each section is one
 *  venue + its running total), venues ordered by their most recent invoice. Used by the artist
 *  profile's Invoices tab. Each row is one invoice (its period) and opens the full invoice. */

/** Latest gig date (YYYY-MM-DD) on an invoice; falls back to the sent date if it has no gigs. */
function lastGigDate(inv: { gigs: { date: string }[]; sentAt: string }): string {
  const dates = (inv.gigs ?? []).map((g) => g.date).filter(Boolean);
  if (dates.length === 0) return (inv.sentAt ?? '').slice(0, 10);
  return dates.reduce((a, b) => (a > b ? a : b));
}

export function ArtistInvoicesList({ artistId }: { artistId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const artistName = getArtistUser(artistId)?.fullName ?? 'This artist';

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.artistId === artistId && !inv.isDeletedByManager)
      .sort((a, b) => lastGigDate(b).localeCompare(lastGigDate(a))),
    [invoices, currentUser?.id, artistId]
  );

  // Group by VENUE (each section = one venue + its running total). `list` is sorted newest-first,
  // so each venue's invoices keep that order; venues are ordered by their most recent invoice.
  // Cancelled invoices don't count toward the venue total (struck through per-row, no real charge).
  const venueGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: typeof list; total: number; latest: string }>();
    list.forEach((inv) => {
      const key = inv.venueId || inv.venueName || 'venue';
      let e = map.get(key);
      if (!e) { e = { key, label: inv.venueName || 'Venue', items: [], total: 0, latest: '' }; map.set(key, e); }
      e.items.push(inv);
      if (inv.status !== 'cancelled') e.total += inv.totalAmount;
      const d = lastGigDate(inv);
      if (d > e.latest) e.latest = d;
    });
    return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [list]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {list.length === 0 ? (
        <EmptyState icon="receipt-long" title="No invoices" subtitle={`${artistName} hasn't sent you any invoices yet.`} />
      ) : venueGroups.map((grp) => (
        <View key={grp.key} style={{ marginBottom: 8 }}>
          <View style={styles.monthHeader}>
            <Text style={[styles.venueHeader, { color: colors.foreground }]} numberOfLines={1}>{grp.label}</Text>
            <Text style={[styles.monthTotal, { color: colors.foreground }]}>AED {grp.total.toLocaleString()}</Text>
          </View>
          {grp.items.map((inv) => {
            const sentDate = new Date(inv.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const cancelled = inv.status === 'cancelled';
            const period = monthLabel(lastGigDate(inv)); // the month this invoice covers
            return (
              <Pressable
                key={inv.id}
                style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId: inv.id } })}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.venueName, { color: colors.foreground, textDecorationLine: cancelled ? 'line-through' : 'none' }]} numberOfLines={1}>{period}</Text>
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
  venueHeader: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  monthTotal: { fontSize: 13, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
