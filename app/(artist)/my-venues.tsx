import { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Image, ActivityIndicator } from '@/lib/rn';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useLineupStore, useNotificationStore, venuePhotoUri } from '@/lib/store';
import { cityFromAddress } from '@/lib/places';
import { Divider } from '@/components/ui/card-free';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import type { Venue } from '@/lib/types';

export default function ArtistMyVenuesScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const { highlightVenueId } = useLocalSearchParams<{ highlightVenueId?: string }>();
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const [dismissedHighlight, setDismissedHighlight] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVenues = useCallback(async () => {
    if (!currentUser?.id) return;
    setIsLoading(true);
    const { data: assignments } = await supabase
      .from('venue_assignments')
      .select('*')
      .eq('artist_id', currentUser.id)
      .eq('status', 'active');
    if (!assignments || assignments.length === 0) {
      useLineupStore.getState().resetVenueAssignmentsForArtist(currentUser.id, []);
      setIsLoading(false);
      return;
    }
    const knownVenueIds = new Set(allVenues.map((v) => v.id));
    const missingIds = assignments.map((a: any) => a.venue_id).filter((id: string) => !knownVenueIds.has(id));
    if (missingIds.length > 0) {
      const { data: venuesData } = await supabase.from('venues').select('*').in('id', missingIds);
      if (venuesData) {
        venuesData.forEach((v: any) => {
          useVenueStore.getState().addVenue({
            id: v.id, managerId: v.manager_id, name: v.name, venueType: v.venue_type,
            photoUrls: v.photo_urls ?? [],
            adminPhotoUrl: v.admin_photo_url ?? undefined,
            genrePreferences: v.genre_preferences ?? [], preferredEnergy: v.preferred_energy ?? [],
            googleMapsLocation: { address: v.address ?? '', lat: v.lat ?? 0, lng: v.lng ?? 0, placeId: v.place_id ?? undefined }, color: v.color ?? '#2563EB',
            isHidden: v.is_hidden ?? false, isComplete: v.is_complete ?? false,
            createdAt: v.created_at, updatedAt: v.updated_at,
          });
        });
      }
    }
    const freshAssignments = assignments.map((a: any) => ({
      id: a.id, globalLineupId: `${a.manager_id}-${currentUser.id}`,
      venueId: a.venue_id, artistId: currentUser.id,
      assignedAt: a.created_at, status: 'active' as const,
    }));
    useLineupStore.getState().resetVenueAssignmentsForArtist(currentUser.id, freshAssignments);
    setIsLoading(false);
  }, [currentUser?.id]);

  // Re-fetch every time the screen comes into focus
  useFocusEffect(useCallback(() => {
    fetchVenues();
  }, [fetchVenues]));

  const myVenues = useMemo(() => {
    const activeAssignments = venueAssignments.filter(
      (a) => a.artistId === currentUser?.id && a.status === 'active'
    );
    const venueIds = activeAssignments.map((a) => a.venueId);
    return allVenues.filter((v) => venueIds.includes(v.id) && !v.isHidden);
  }, [venueAssignments, allVenues, currentUser?.id]);

  const handleVenuePress = useCallback((venueId: string) => {
    if (highlightVenueId && venueId === highlightVenueId && !dismissedHighlight) {
      setDismissedHighlight(true);
      allNotifications
        .filter(
          (n) =>
            n.userId === currentUser?.id &&
            !n.isRead &&
            n.type === 'venue_assigned' &&
            n.relatedId === venueId
        )
        .forEach((n) => markAsRead(n.id));
    }
    router.push(('/(artist)/venue-detail?id=' + venueId) as import('expo-router').Href);
  }, [highlightVenueId, dismissedHighlight, allNotifications, currentUser?.id, markAsRead, router]);

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

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
      <FlatList
        ItemSeparatorComponent={() => <Divider full />}
        data={myVenues}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="place" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              You'll see venues here once a manager assigns you to one.
            </Text>
          </View>
        }
        renderItem={({ item: venue }: { item: Venue }) => {
          const venueTypeLabel = venue.venueType
            ? venue.venueType.charAt(0).toUpperCase() + venue.venueType.slice(1).replace(/_/g, ' ')
            : 'Venue';
          const isHighlighted = highlightVenueId === venue.id && !dismissedHighlight;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={() => handleVenuePress(venue.id)}
            >
              <View style={styles.cardLeft}>
                {venuePhotoUri(venue) ? (
                  <Image
                    source={{ uri: venuePhotoUri(venue) }}
                    style={[styles.iconWrap, { borderColor: colors.border }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <MaterialIcons name="place" size={22} color={colors.muted} />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>
                    {venue.name}
                  </Text>
                  <Text style={[styles.venueType, { color: colors.muted }]} numberOfLines={1}>
                    {venueTypeLabel}
                    {venue.googleMapsLocation?.address ? ` · ${cityFromAddress(venue.googleMapsLocation.address)}` : ''}
                  </Text>
                  {isHighlighted && (
                    <Text style={[styles.newLabel, { color: colors.primary }]}>Newly assigned</Text>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          );
        }}
      />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  info: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  venueType: { fontSize: 13, marginBottom: 2 },
  newLabel: { fontSize: 12, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
