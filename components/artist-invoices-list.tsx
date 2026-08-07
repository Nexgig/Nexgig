import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from '@/lib/rn';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

/** All invoices a single artist has sent to this manager. Used by the artist profile's
 *  Invoices tab and the standalone artist-invoices screen. Each row opens the full invoice. */
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
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, currentUser?.id, artistId]
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      {list.length === 0 ? (
        <EmptyState icon="receipt-long" title="No invoices" subtitle={`${artistName} hasn't sent you any invoices yet.`} />
      ) : list.map((inv) => {
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
                {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}{inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ''}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
