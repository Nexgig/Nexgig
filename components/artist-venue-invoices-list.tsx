import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

/** The invoices THIS artist has sent for one venue, newest first. Tapping opens the read-only
 *  invoice. Flows inside the venue-detail ScrollView (a View, not its own scroller). */
export function ArtistVenueInvoicesList({ venueId }: { venueId: string }) {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.artistId === currentUser?.id && inv.venueId === venueId)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, currentUser?.id, venueId]
  );

  if (list.length === 0) {
    return <EmptyState icon="receipt-long" title="No invoices sent" subtitle="Invoices you send for this venue show up here." />;
  }

  return (
    <View style={styles.wrap}>
      {list.map((inv) => {
        const sentDate = new Date(inv.sentAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const cancelled = inv.status === 'cancelled';
        return (
          <Pressable
            key={inv.id}
            style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(`/(artist)/invoice-preview?invoiceId=${inv.id}&readOnly=1` as Href)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.num, { color: cancelled ? colors.muted : colors.success }]}>{inv.invoiceNumber}</Text>
              <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={[styles.amount, { color: cancelled ? colors.muted : colors.success, textDecorationLine: cancelled ? 'line-through' : 'none' }]}>AED {inv.totalAmount.toLocaleString()}</Text>
              {cancelled && <Text style={[styles.cancelled, { color: colors.error }]}>CANCELLED</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  num: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  meta: { fontSize: 12 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
});
