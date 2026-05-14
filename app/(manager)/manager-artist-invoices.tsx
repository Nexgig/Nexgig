import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { useInvoiceStore } from '@/lib/store';
import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import type { Invoice } from '@/lib/types';

export default function ManagerArtistInvoicesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId, artistName } = useLocalSearchParams<{ artistId: string; artistName: string }>();
  const invoices = useInvoiceStore((s) => s.invoices);

  const artistInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => inv.artistId === artistId)
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [invoices, artistId]
  );

  const renderItem = ({ item, index }: { item: Invoice; index: number }) => {
    const isUnread = !item.isReadByManager;
    const isNewest = index === 0 && isUnread;
    const sentDate = new Date(item.sentAt).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Pressable
        style={({ pressed }) => [
          styles.invoiceCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: '/(manager)/manager-invoice-detail' as any,
            params: { invoiceId: item.id },
          });
        }}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={[styles.invoiceNumber, { color: colors.primary }]}>{item.invoiceNumber}</Text>
            <Text style={[styles.venueName, { color: colors.foreground }]}>{item.venueName}</Text>
            <Text style={[styles.sentDate, { color: colors.muted }]}>
              {item.gigs.length} gig{item.gigs.length !== 1 ? 's' : ''} · Sent {sentDate}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.amount, { color: colors.primary }]}>
              AED {item.totalAmount.toLocaleString()}
            </Text>
            {isUnread && (
              <View style={[styles.unreadDot, { backgroundColor: '#F97316' }]} />
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {artistName}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {artistInvoices.length} invoice{artistInvoices.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {artistInvoices.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="receipt-long" size={48} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>No invoices yet</Text>
        </View>
      ) : (
        <FlatList
          data={artistInvoices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  listContent: { padding: 16, gap: 10 },
  invoiceCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, gap: 3 },
  invoiceNumber: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  venueName: { fontSize: 15, fontWeight: '700' },
  sentDate: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 15, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15 },
});
