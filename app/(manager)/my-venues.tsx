import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image } from '@/lib/rn';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { venueImage } from '@/lib/venue-images';

/** "night_club" -> "Night club" */
function typeLabel(t?: string | null): string {
  if (!t) return '';
  const s = t.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MyVenuesScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);

  const venues = useMemo(
    () => allVenues
      .filter((v) => v.managerId === currentUser?.id && !v.isHidden)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [allVenues, currentUser?.id]
  );

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My Venues</Text>
        <Pressable style={({ pressed }) => [styles.iconBtn, { alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 }]} onPress={() => router.push('/(manager)/create-venue' as Href)} hitSlop={8}>
          <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={venues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="place" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Venues you create appear here</Text>
          </View>
        }
        renderItem={({ item: venue }) => {
          const notVerified = venue.verificationStatus !== 'verified';
          const rejected = venue.verificationStatus === 'rejected';
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
            >
              <Image source={venueImage(venue.venueType)} style={styles.thumb} resizeMode="cover" />
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text style={[styles.name, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{venue.name}</Text>
                  {venue.verificationStatus === 'verified' && (
                    <MaterialIcons name="verified" size={15} color={colors.primary} />
                  )}
                </View>
                {venue.venueType ? (
                  <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>{typeLabel(venue.venueType)}</Text>
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
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  iconBtn: { width: 36 },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingVertical: 8, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 1 },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  verifyPillText: { fontSize: 10, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
