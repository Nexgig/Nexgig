import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore, useInvoiceStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';

// All invoices a single artist has sent to this manager. Opened from the manager profile's
// per-artist Invoices list. Each row opens the full invoice in manager-invoice-detail.
export default function ArtistInvoicesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId, name } = useLocalSearchParams<{ artistId?: string; name?: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const invoices = useInvoiceStore((s) => s.invoices);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  const artist = artistId ? getArtistUser(artistId) : undefined;

  const list = useMemo(
    () => invoices
      .filter((inv) => inv.managerId === currentUser?.id && inv.artistId === artistId && !inv.isDeletedByManager)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, currentUser?.id, artistId]
  );

  const artistName = artist?.fullName ?? (typeof name === 'string' ? name : undefined) ?? list[0]?.artistLegalName ?? 'Artist';

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <AvatarImage uri={artist?.profilePhotoUrl} avatarId={artist?.avatarId} seed={artistId} name={artistName} size={34} variant="artist" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{artistName}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{list.length} invoice{list.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

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
                  {!inv.isReadByManager && <View style={[styles.unreadDot, { backgroundColor: colors.error }]} />}
                </View>
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                  {inv.gigs.length} gig{inv.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}{inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={[styles.amount, { color: cancelled ? colors.muted : colors.error, textDecorationLine: cancelled ? 'line-through' : 'none' }]}>AED {inv.totalAmount.toLocaleString()}</Text>
                {cancelled && <Text style={[styles.cancelled, { color: colors.error }]}>CANCELLED</Text>}
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { padding: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '700' },
  cancelled: { fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
