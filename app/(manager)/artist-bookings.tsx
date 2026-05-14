import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useBookingStore, useSlotStore, useVenueStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';

type Tab = 'pending' | 'upcoming' | 'completed';

export default function ArtistBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId } = useLocalSearchParams<{ artistId: string }>();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  const artist = getArtistUser(artistId ?? '');

  // All bookings for this artist under this manager
  const artistBookings = useMemo(
    () => allBookings.filter((b) => b.artistId === artistId && b.managerId === currentUser?.id),
    [allBookings, artistId, currentUser?.id]
  );

  const today = new Date().toISOString().split('T')[0];

  // Enrich bookings with slot + venue data
  const enriched = useMemo(() => {
    return artistBookings.map((b) => {
      const slot = allSlots.find((s) => s.id === b.slotId);
      const venue = allVenues.find((v) => v.id === b.venueId);
      const resolvedSlot = slot ?? (b.slotDate ? {
        id: b.slotId, venueId: b.venueId, date: b.slotDate,
        name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
        endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
      } : undefined);
      const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
      return { ...b, slot: resolvedSlot, venue: resolvedVenue };
    });
  }, [artistBookings, allSlots, allVenues]);

  const pendingBookings = useMemo(
    () => enriched
      .filter((b) => b.status === 'requested' || b.status === 'past_confirmation')
      .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1),
    [enriched]
  );

  const upcomingBookings = useMemo(
    () => enriched
      .filter((b) => b.status === 'confirmed' && !b.isCompleted && (b.slot?.date ?? '') >= today)
      .sort((a, b) => (a.slot?.date ?? '') < (b.slot?.date ?? '') ? -1 : 1),
    [enriched, today]
  );

  const completedBookings = useMemo(
    () => enriched
      .filter((b) => b.isCompleted || b.status === 'completed')
      .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1),
    [enriched]
  );

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'pending', label: 'Pending', count: pendingBookings.length, color: colors.warning },
    { key: 'upcoming', label: 'Upcoming', count: upcomingBookings.length, color: colors.success },
    { key: 'completed', label: 'Completed', count: completedBookings.length, color: colors.primary },
  ];

  const activeData =
    activeTab === 'pending' ? pendingBookings :
    activeTab === 'upcoming' ? upcomingBookings :
    completedBookings;

  const getStatusColor = (tab: Tab) => {
    if (tab === 'pending') return colors.warning;
    if (tab === 'upcoming') return colors.success;
    return colors.primary;
  };

  const getStatusIcon = (tab: Tab): 'schedule' | 'check-circle' | 'event-available' => {
    if (tab === 'pending') return 'schedule';
    if (tab === 'upcoming') return 'event-available';
    return 'check-circle';
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bookings</Text>
          {artist?.fullName ? (
            <Text style={[styles.headerSub, { color: colors.muted }]} numberOfLines={1}>{artist.fullName}</Text>
          ) : null}
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabLabel, { color: activeTab === tab.key ? tab.color : colors.muted }]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: tab.color + '22' }]}>
                <Text style={[styles.tabBadgeText, { color: tab.color }]}>{tab.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={activeData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name={getStatusIcon(activeTab)} size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No {activeTab} bookings
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = getStatusColor(activeTab);
          const statusIcon = getStatusIcon(activeTab);
          return (
            <Pressable
              style={({ pressed }) => [styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push(('/(manager)/booking-detail?id=' + item.id) as Href)}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor + '20' }]}>
                <MaterialIcons name={statusIcon} size={18} color={statusColor} />
              </View>
              <View style={styles.bookingInfo}>
                <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
                  {item.venue?.name ?? item.venueName ?? 'Unknown Venue'}
                </Text>
                <Text style={[styles.bookingDate, { color: colors.muted }]} numberOfLines={1}>
                  {item.slot?.date ? formatDate(item.slot.date) : 'Date unknown'}
                  {item.slot?.startTime && item.slot?.endTime
                    ? ` · ${formatTime(item.slot.startTime)}–${formatTime(item.slot.endTime)}`
                    : ''}
                </Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4 },
  headerTextBlock: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 1 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 0.5,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  tabLabel: { fontSize: 14, fontWeight: '600' },
  tabBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  tabBadgeText: { fontSize: 11, fontWeight: '700' },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontWeight: '500' },
  bookingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  statusDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bookingInfo: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  bookingDate: { fontSize: 13 },
});
