import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Alert, ActivityIndicator, Image, RefreshControl } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useNotificationStore, useLineupStore, useNetworkSeenStore, useArtistDirectoryStore, useVenueDirectoryStore, mapVenueRow } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { fonts } from '@/lib/fonts';
import { venueImage } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import { genreLabel } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type NetworkTab = 'venues' | 'artists';

type VenueItem = {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  genre_preferences: string[];
  photo_urls: string[] | null;
  admin_photo_url: string | null;
  manager_id: string;
  verification_status: string | null;
};

type ArtistItem = {
  id: string;
  full_name: string;
  primary_genre: string;
  based_in: string;
  profile_photo_url: string;
  secondary_genres: string[];
  instruments?: string[];
  has_completed_booking?: boolean;
};

/** "night_club" -> "Night club" */
function venueTypeLabel(t?: string | null): string {
  if (!t) return '';
  const s = t.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ArtistNetworkScreen() {
  const colors = useColors();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);

  const addNotification = useNotificationStore((s) => s.addNotification);
  const notifications = useNotificationStore((s) => s.notifications);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);
  const markNetworkSeen = useNetworkSeenStore((s) => s.markNetworkSeen);
  const isFocused = useIsFocused();

  // Derive assigned venue IDs reactively from the store — updates instantly when manager removes artist
  const assignedVenueIds = useMemo(() =>
    new Set(
      venueAssignments
        .filter((a) => a.artistId === currentUser?.id && a.status === 'active')
        .map((a) => a.venueId)
    ),
    [venueAssignments, currentUser?.id]
  );
  const [activeTab, setActiveTab] = useState<NetworkTab>('venues');
  const [search, setSearch] = useState('');

  // ── Venues state ───────────────────────────────────────────────────────────
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [appliedVenueIds, setAppliedVenueIds] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'venues') await fetchVenues();
    else await fetchArtists();
    setRefreshing(false);
  }, [activeTab]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [venuesFetched, setVenuesFetched] = useState(false);

  // ── Artists state ──────────────────────────────────────────────────────────
  const [artists, setArtists] = useState<ArtistItem[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsFetched, setArtistsFetched] = useState(false);

  // ── Clear the Network dot on focus (no re-fetch on back-navigation) ────────
  // Venues/artists are fetched once on first tab open + via pull-to-refresh.
  useFocusEffect(useCallback(() => {
    if (currentUser?.id) markNetworkSeen(currentUser.id);
  }, [currentUser?.id]));

  // ── Also clear the dot if a notification arrives while already on this tab ──
  useEffect(() => {
    if (isFocused && currentUser?.id) markNetworkSeen(currentUser.id);
  }, [notifications, isFocused, currentUser?.id]);

  // ── Lazy-fetch venues/artists on first tab open ────────────────────────────
  useEffect(() => {
    if (activeTab === 'venues' && !venuesFetched) fetchVenues();
    if (activeTab === 'artists' && !artistsFetched) fetchArtists();
  }, [activeTab]);

  const fetchVenues = async () => {
    if (!currentUser) return;
    setVenuesLoading(true);
    const [venuesRes, appsRes] = await Promise.all([
      supabase.from('venues').select('*').neq('is_hidden', true),
      supabase.from('applications').select('venue_id').eq('artist_id', currentUser.id).eq('status', 'pending'),
    ]);
    if (venuesRes.data) {
      setVenues(venuesRes.data.map((v: any) => ({
        id: v.id,
        name: v.name,
        venue_type: v.venue_type,
        address: v.google_maps_location?.address ?? v.address ?? null,
        genre_preferences: Array.isArray(v.genre_preferences) ? v.genre_preferences : [],
        photo_urls: Array.isArray(v.photo_urls) ? v.photo_urls : null,
        admin_photo_url: v.admin_photo_url ?? null,
        manager_id: v.manager_id,
        verification_status: v.verification_status ?? null,
      })) as VenueItem[]);
      // Cache full venue data so tapping a venue opens its detail complete (no fetch-on-open).
      useVenueDirectoryStore.getState().setVenues(venuesRes.data.map((v: any) => mapVenueRow(v)));
    }
    setAppliedVenueIds(new Set((appsRes.data ?? []).map((a: any) => a.venue_id)));
    setVenuesFetched(true);
    setVenuesLoading(false);
  };

  const fetchArtists = async () => {
    setArtistsLoading(true);
    const { data } = await supabase
      .from('artists')
      .select('*');
    if (data) {
      setArtists(data as ArtistItem[]);
      // Cache the FULL artist data so tapping an artist opens their profile complete on
      // the first frame (no fetch-on-open second pass) — same pattern as the manager side.
      useArtistDirectoryStore.getState().setArtists(data.map((a: any) => ({
        user: {
          id: a.id, email: '', phone: '', accountType: 'artist' as const,
          fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined, avatarId: a.avatar_id ?? undefined, bio: a.bio ?? undefined,
          location: a.based_in ?? undefined, yearsOfExperience: a.years_of_experience ?? undefined,
          isPhoneVerified: false, isEmailVerified: false,
          createdAt: a.created_at, updatedAt: a.updated_at,
        },
        profile: {
          userId: a.id, primaryGenre: a.primary_genre,
          secondaryGenres: Array.isArray(a.secondary_genres) ? a.secondary_genres : [],
          instruments: Array.isArray(a.instruments) ? a.instruments : [],
          minRate: a.min_rate ?? undefined, gender: a.gender ?? undefined,
          basedIn: a.based_in ?? undefined, nationality: a.nationality ?? undefined,
          isHistoryHidden: a.is_history_hidden ?? false,
          instagramUrl: a.instagram_url ?? undefined, soundcloudUrl: a.soundcloud_url ?? undefined,
          mixcloudUrl: a.mixcloud_url ?? undefined, spotifyUrl: a.spotify_url ?? undefined,
        },
      })));
    }
    setArtistsFetched(true);
    setArtistsLoading(false);
  };

  const handleJoin = async (venue: VenueItem) => {
    if (!currentUser) return;
    Alert.alert('Join Venue', `Send a request to join ${venue.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Join',
        onPress: async () => {
          setApplyingId(venue.id);
          const { error } = await supabase.from('applications').insert({
            artist_id: currentUser.id,
            manager_id: venue.manager_id,
            venue_id: venue.id,
            status: 'pending',
          });
          if (error) {
            setApplyingId(null);
            Alert.alert('Error', error.message);
            return;
          }
          // Notify manager
          const notifId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          addNotification({
            id: notifId,
            userId: venue.manager_id,
            type: 'lineup_request',
            title: 'New Join Request',
            body: `${currentUser.fullName ?? 'An artist'} · ${venue.name}`,
            isRead: false,
            relatedId: venue.id,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
          setApplyingId(null);
          setAppliedVenueIds((prev) => new Set([...prev, venue.id]));
        },
      },
    ]);
  };

  const handleLeaveVenue = (venue: VenueItem) => {
    if (!currentUser) return;
    Alert.alert('Leave Venue', `Leave the lineup at ${venue.name}? You can request to join again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          const { error, count } = await supabase
            .from('venue_assignments')
            .delete({ count: 'exact' })
            .eq('artist_id', currentUser.id)
            .eq('venue_id', venue.id);
          if (error) { Alert.alert('Error', error.message); return; }
          if (!count) { Alert.alert('Could not leave', 'You were not removed — please try again.'); return; }
          removeFromVenue(venue.id, currentUser.id);
          const notifId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          addNotification({
            id: notifId,
            userId: venue.manager_id,
            type: 'lineup_removed' as any,
            title: 'Artist Left Venue',
            body: `${currentUser.fullName ?? 'An artist'} · ${venue.name}`,
            isRead: false,
            relatedId: venue.id,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = q
      ? venues.filter((v) =>
          v.name.toLowerCase().includes(q) ||
          v.venue_type?.toLowerCase().includes(q) ||
          v.address?.toLowerCase().includes(q)
        )
      : venues;
    return [...results].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [venues, search]);

  const filteredArtists = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = q
      ? artists.filter((a) =>
          a.full_name?.toLowerCase().includes(q) ||
          a.primary_genre?.toLowerCase().includes(q) ||
          a.based_in?.toLowerCase().includes(q)
        )
      : artists;
    return [...results].sort((a, b) => (a.full_name ?? '').toLowerCase().localeCompare((b.full_name ?? '').toLowerCase()));
  }, [artists, search]);

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Network</Text>
      </View>

      {/* Sub-tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['venues', 'artists'] as NetworkTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab(tab); setSearch(''); }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search bar for venues and artists */}
      {(activeTab === 'venues' || activeTab === 'artists') && (
        <View style={[styles.searchWrap, { borderColor: colors.border }]}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={activeTab === 'venues' ? 'Search venues...' : 'Search artists...'}
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>
      )}

      {/* Venues tab */}
      {activeTab === 'venues' && (
        venuesLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
        ItemSeparatorComponent={() => <Divider full />}
            data={filteredVenues}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <MaterialIcons name="place" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  {search ? 'Try a different search term' : 'No venues available yet'}
                </Text>
              </View>
            }
            renderItem={({ item: venue }) => {
              const isConnected = assignedVenueIds.has(venue.id);
              const hasApplied = appliedVenueIds.has(venue.id);
              const isApplying = applyingId === venue.id;
              const rowContent = (
                <Pressable
                  style={({ pressed }) => [styles.rowCard, {
                    backgroundColor: 'transparent',
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  }]}
                  onPress={() => router.push((`/(artist)/venue-detail?id=` + venue.id) as Href)}
                >
                  <View style={styles.cardLeft}>
                    <Image source={venueImage(venue.venue_type)} style={styles.thumb} resizeMode="cover" />
                    <View style={styles.cardInfo}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.cardTitle, { color: colors.foreground, flexShrink: 1, marginBottom: 0 }]} numberOfLines={1}>{venue.name}</Text>
                        {venue.verification_status === 'verified' && (
                          <MaterialIcons name="verified" size={15} color={colors.primary} />
                        )}
                      </View>
                      {venue.venue_type ? (
                        <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                          {venueTypeLabel(venue.venue_type)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {isConnected ? (
                    <Pressable
                      style={({ pressed }) => [styles.applyBtn, { borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                      onPress={(e) => { e.stopPropagation(); handleLeaveVenue(venue); }}
                    >
                      <Text style={[styles.applyBtnText, { color: colors.foreground }]}>Connected</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[
                        styles.applyBtn,
                        hasApplied
                          ? { backgroundColor: colors.border }
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={(e) => { e.stopPropagation(); !hasApplied && handleJoin(venue); }}
                      disabled={hasApplied || isApplying}
                    >
                      {isApplying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : hasApplied ? (
                        <Text style={[styles.applyBtnText, { color: colors.muted }]}>Sent</Text>
                      ) : (
                        <>
                          <MaterialIcons name="link" size={14} color="#fff" />
                          <Text style={[styles.applyBtnText, { color: '#fff' }]}>Connect</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </Pressable>
              );
              return rowContent;
            }}
          />
        )
      )}

      {/* Artists tab */}
      {activeTab === 'artists' && (
        artistsLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
        ItemSeparatorComponent={() => <Divider full />}
            data={filteredArtists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <MaterialIcons name="people" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Artists Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  {search ? 'Try a different search term' : 'No artists available yet'}
                </Text>
              </View>
            }
            renderItem={({ item: artist }) => (
              <Pressable
                style={({ pressed }) => [styles.rowCard, { backgroundColor: 'transparent', borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push((`/(artist)/artist-profile-view?artistId=` + artist.id) as Href)}
              >
                <View style={styles.cardLeft}>
                  <AvatarImage uri={artist.profile_photo_url || undefined} avatarId={(artist as any).avatar_id ?? undefined} seed={artist.id} name={artist.full_name} size={48} />
                  <View style={styles.cardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{artist.full_name}</Text>
                      {artist.has_completed_booking && (
                        <MaterialIcons name="verified" size={15} color={colors.primary} />
                      )}
                    </View>
                    <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                      {genreLabel(artist.primary_genre, artist.instruments)}
                    </Text>
                  </View>
                </View>
                <View style={styles.rightWrap}>
                  {artist.id === currentUser?.id && (
                    <View style={[styles.youPill, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.youPillText, { color: colors.primary }]}>You</Text>
                    </View>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </View>
              </Pressable>
            )}
          />
        )
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, minHeight: 72 },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  verifiedPillText: { fontSize: 10, fontWeight: '700' },
  cardSub: { fontSize: 13, marginBottom: 0 },
  cardMeta: { fontSize: 12 },
  rightWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  youPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  youPillText: { fontSize: 10, fontWeight: '700' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  connectedText: { fontSize: 11, fontWeight: '700' },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, minWidth: 72 },
  applyBtnText: { fontSize: 12, fontWeight: '700' },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
