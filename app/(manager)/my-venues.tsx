import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useVenueStore } from '@/lib/store';
import { cityFromAddress } from '@/lib/places';
import { Divider } from '@/components/ui/card-free';
import { venueImage } from '@/lib/venue-images';
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
        {/* Add venue — matches the calendar header "+" */}
        <Pressable
          style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.push('/(manager)/create-venue' as Href)}
          hitSlop={8}
        >
          <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={venues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="place" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Venues you create will appear here</Text>
          </View>
        }
        renderItem={({ item: venue }: { item: Venue }) => {
          const city = cityFromAddress(venue.googleMapsLocation?.address);
          const subtitle = venue.capacity
            ? `${city ? city + ' · ' : ''}Cap ${venue.capacity}`
            : city;
          const notVerified = venue.verificationStatus !== 'verified';
          const rejected = venue.verificationStatus === 'rejected';
          return (
            <Pressable
              style={({ pressed }) => [styles.rowCard, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
            >
              <View style={styles.cardLeft}>
                <Image
                  source={venueImage(venue.venueType)}
                  style={[styles.thumb, { borderColor: colors.border }]}
                  resizeMode="cover"
                />
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.venueName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                      {venue.name}
                    </Text>
                    {venue.verificationStatus === 'verified' && (
                      <MaterialIcons name="verified" size={15} color={colors.primary} />
                    )}
                  </View>
                  {subtitle ? (
                    <Text style={[styles.venueSub, { color: colors.muted }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                  {notVerified && (
                    <View style={[styles.verifyPill, { backgroundColor: (rejected ? colors.error : colors.warning) + '15' }]}>
                      <MaterialIcons name={rejected ? 'cancel' : 'schedule'} size={11} color={rejected ? colors.error : colors.warning} />
                      <Text style={[styles.verifyPillText, { color: rejected ? colors.error : colors.warning }]}>
                        {rejected ? 'Not approved' : 'Pending verification'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, gap: 10,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  addBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 1 },
  venueName: { fontSize: 14, fontWeight: '600' },
  venueSub: { fontSize: 13 },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  verifyPillText: { fontSize: 10, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
