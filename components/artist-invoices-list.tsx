import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore, useLineupStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { monthKey, monthLabel } from '@/lib/utils';
import { groupByCycle } from '@/lib/billing-cycle';

/** All invoices a single artist has sent to this manager. A horizontal row of venue pills filters
 *  by venue (like the Bookings tab); within the selection, invoices are grouped by month (of the
 *  invoice's last gig, with a month total), newest first. Used by the artist profile's Invoices
 *  tab. Each row is one invoice and opens the full invoice. */

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
  const getVenueById = useVenueStore((s) => s.getVenueById);
  const artistName = getArtistUser(artistId)?.fullName ?? 'This artist';

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.artistId === artistId && !inv.isDeletedByManager)
      .sort((a, b) => lastGigDate(b).localeCompare(lastGigDate(a))),
    [invoices, currentUser?.id, artistId]
  );

  // Venue-filter pills (All + each venue this artist invoiced, most-invoiced first).
  const venuePills = useMemo(() => {
    const map = new Map<string, { venueId: string; name: string; count: number }>();
    list.forEach((inv) => {
      const venueId = inv.venueId || inv.venueName || 'venue';
      const name = inv.venueName || 'Venue';
      const e = map.get(venueId) ?? { venueId, name, count: 0 };
      e.count += 1;
      map.set(venueId, e);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [list]);

  const [venueFilter, setVenueFilter] = useState<string | null>(null); // null = all venues
  useEffect(() => { setVenueFilter(null); }, [artistId]); // reset when the profile switches artist

  // Filter by the selected venue, then group. A single selected venue → group by THAT venue's
  // BILLING CYCLE (label e.g. "16 Jul – 15 Aug 2025"); "All" spans venues with different cycles,
  // so fall back to calendar months. Cancelled invoices don't count toward the total.
  const total = (items: typeof list) => items.reduce((s, inv) => s + (inv.status !== 'cancelled' ? inv.totalAmount : 0), 0);
  const months = useMemo(() => {
    const filtered = venueFilter ? list.filter((inv) => (inv.venueId || inv.venueName || 'venue') === venueFilter) : list;
    if (venueFilter) {
      const cycleDay = getVenueById(venueFilter)?.billingCycleEndDay ?? 31;
      return groupByCycle(filtered, (inv) => lastGigDate(inv), cycleDay).map((g) => ({
        key: g.cycle.key, label: g.cycle.label, items: g.items, total: total(g.items),
      }));
    }
    const map = new Map<string, { key: string; label: string; items: typeof list; total: number }>();
    filtered.forEach((inv) => {
      const d = lastGigDate(inv);
      const key = monthKey(d);
      let e = map.get(key);
      if (!e) { e = { key, label: monthLabel(d), items: [], total: 0 }; map.set(key, e); }
      e.items.push(inv);
      if (inv.status !== 'cancelled') e.total += inv.totalAmount;
    });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, venueFilter, getVenueById]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {list.length === 0 ? (
        <EmptyState icon="receipt-long" title="No invoices" subtitle={`${artistName} hasn't sent you any invoices yet.`} />
      ) : (
        <>
          {venuePills.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => setVenueFilter(null)}
                style={[styles.pill, { backgroundColor: venueFilter === null ? colors.primary : colors.surface, borderColor: venueFilter === null ? colors.primary : colors.border }]}
              >
                <Text style={[styles.pillText, { color: venueFilter === null ? '#FFFFFF' : colors.foreground }]}>All</Text>
              </Pressable>
              {venuePills.map((v) => {
                const on = venueFilter === v.venueId;
                return (
                  <Pressable
                    key={v.venueId}
                    onPress={() => setVenueFilter(v.venueId)}
                    style={[styles.pill, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                  >
                    <Text style={[styles.pillText, { color: on ? '#FFFFFF' : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {months.map((m) => (
            <View key={m.key} style={{ marginBottom: 8 }}>
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
                    onPress={() => router.push({ pathname: '/(manager)/manager-invoice-detail' as any, params: { invoiceId: inv.id } })}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.venueName, { color: colors.foreground, textDecorationLine: cancelled ? 'line-through' : 'none' }]} numberOfLines={1}>{inv.venueName}</Text>
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 14, paddingRight: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, maxWidth: 180 },
  pillText: { fontSize: 13, fontWeight: '700' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, paddingTop: 6, paddingBottom: 8 },
  monthLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  monthTotal: { fontSize: 13, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
