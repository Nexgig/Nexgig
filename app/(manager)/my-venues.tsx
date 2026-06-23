import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Image } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { Venue } from '@/lib/types';

export default function ManagerMyVenuesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My Venues</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={venues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="place" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Venues you create will appear here</Text>
          </View>
        }
        renderItem={({ item: venue }: { item: Venue }) => {
          const venueTypeLabel = venue.venueType
            ? venue.venueType.charAt(0).toUpperCase() + venue.venueType.slice(1).replace(/_/g, ' ')
            : 'Venue';
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
            >
              <View style={styles.cardLeft}>
                {venue.photoUrls && venue.photoUrls.length > 0 ? (
                  <Image
                    source={{ uri: venue.photoUrls[0] }}
                    style={[styles.iconWrap, { borderColor: colors.border }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="place" size={22} color={colors.muted} />
                  </View>
                )}
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    {venue.verificationStatus === 'verified' && (
                      <MaterialIcons name="verified" size={15} color={colors.primary} />
                    )}
                    <Text style={[styles.venueName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                      {venue.name}
                    </Text>
                  </View>
                  <Text style={[styles.venueType, { color: colors.muted }]} numberOfLines={1}>
                    {venueTypeLabel}
                    {venue.googleMapsLocation?.address ? ` · ${venue.googleMapsLocation.address}` : ''}
                  </Text>
                  {venue.capacity ? (
                    <Text style={[styles.capacity, { color: colors.muted }]}>
                      Capacity: {venue.capacity}
                    </Text>
                  ) : null}
                  {venue.verificationStatus === 'rejected' ? (
                    <View style={[styles.verifyPill, { backgroundColor: colors.error + '15' }]}>
                      <MaterialIcons name="cancel" size={11} color={colors.error} />
                      <Text style={[styles.verifyPillText, { color: colors.error }]}>Not approved</Text>
                    </View>
                  ) : venue.verificationStatus !== 'verified' ? (
                    <View style={[styles.verifyPill, { backgroundColor: colors.warning + '15' }]}>
                      <MaterialIcons name="schedule" size={11} color={colors.warning} />
                      <Text style={[styles.verifyPillText, { color: colors.warning }]}>Pending verification</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          );
        }}
      />
      {/* FAB */}
      <Pressable
        style={[styles.fabWrapper, { bottom: Math.max(insets.bottom, 8) + 56 + 24 }]}
        onPress={() => router.push('/(manager)/create-venue' as Href)}
      >
        <LinearGradient
          colors={['#3D7EE8', '#1A56C4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fab}
        >
          <MaterialIcons name="add" size={24} color="rgba(255,255,255,0.95)" />
        </LinearGradient>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, gap: 10,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  list: { padding: 20, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  info: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  venueType: { fontSize: 13, marginBottom: 2 },
  capacity: { fontSize: 12 },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  verifyPillText: { fontSize: 10, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  fabWrapper: { position: 'absolute', right: 24, width: 50, height: 50, borderRadius: 25, shadowColor: '#1A56C4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 10 },
  fab: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  discoverBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  discoverBtnText: { fontSize: 13, fontWeight: '700' },
});
