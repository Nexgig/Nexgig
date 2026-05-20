import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';
import { supabase } from '@/lib/supabase';

type VenueItem = {
  id: string;
  name: string;
  venue_type: string;
  address: string;
  genre_preferences: string[];
  manager_id: string;
};

type ArtistItem = {
  id: string;
  full_name: string;
  primary_genre: string;
  based_in: string;
  profile_photo_url: string;
  secondary_genres: string[];
};

type ExploreTab = 'venues' | 'artists';

export default function ExploreScreen() {
  const colors = useColors();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [activeTab, setActiveTab] = useState<ExploreTab>('venues');
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [artists, setArtists] = useState<ArtistItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [appliedVenueIds, setAppliedVenueIds] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchVenues();
    fetchArtists();
    fetchExistingApplications();
  }, []);

  const fetchVenues = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, venue_type, address, genre_preferences, manager_id')
      .eq('is_hidden', false);
    if (!error && data) setVenues(data);
console.log('venues data:', data);
console.log('venues error:', error);
setIsLoading(false);
  };

  const fetchArtists = async () => {
    const { data, error } = await supabase
      .from('artists')
      .select('id, full_name, primary_genre, based_in, profile_photo_url, secondary_genres')
      .neq('id', currentUser?.id ?? '');
    if (!error && data) setArtists(data);
  };

  const fetchExistingApplications = async () => {
    if (!currentUser) return;
    const { data } = await supabase
      .from('applications')
      .select('venue_id')
      .eq('artist_id', currentUser.id)
      .in('status', ['pending', 'accepted']);
    if (data) {
      setAppliedVenueIds(new Set(data.map((a: any) => a.venue_id)));
    }
  };

  const handleApply = async (venue: VenueItem) => {
    if (!currentUser) return;
    Alert.alert(
      'Apply to Venue',
      `Send an application to ${venue.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            setApplyingId(venue.id);
            const { error } = await supabase.from('applications').insert({
              artist_id: currentUser.id,
              manager_id: venue.manager_id,
              venue_id: venue.id,
              status: 'pending',
            });
            setApplyingId(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setAppliedVenueIds((prev) => new Set([...prev, venue.id]));
              Alert.alert('Applied!', `Your application to ${venue.name} has been sent.`);
            }
          },
        },
      ]
    );
  };

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = q
      ? venues.filter(
          (v) =>
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
      ? artists.filter(
          (a) =>
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.foreground }]}>Explore</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Venues & Artists</Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['venues', 'artists'] as ExploreTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab(tab); setSearch(''); }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab === 'venues' ? `Venues (${filteredVenues.length})` : `Artists (${filteredArtists.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeTab === 'venues' ? (
        <FlatList
          data={filteredVenues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
            const hasApplied = appliedVenueIds.has(venue.id);
            const isApplying = applyingId === venue.id;
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardLeft}>
                  <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialIcons name="place" size={22} color={colors.muted} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
                    <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                      {venue.venue_type}{venue.address ? ` · ${venue.address}` : ''}
                    </Text>
                    {venue.genre_preferences && venue.genre_preferences.length > 0 && (
                      <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
                        {venue.genre_preferences.slice(0, 3).join(' · ')}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable
                  style={[
                    styles.applyBtn,
                    {
                      backgroundColor: hasApplied ? colors.surface : colors.primary,
                      borderColor: hasApplied ? colors.border : colors.primary,
                    },
                  ]}
                  onPress={() => !hasApplied && handleApply(venue)}
                  disabled={hasApplied || isApplying}
                >
                  {isApplying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.applyBtnText, { color: hasApplied ? colors.muted : '#fff' }]}>
                      {hasApplied ? 'Applied' : 'Apply'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredArtists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push((`/(artist)/artist-profile-view?artistId=` + artist.id) as Href)}
            >
              <View style={styles.cardLeft}>
                <AvatarImage uri={artist.profile_photo_url} name={artist.full_name} size={48} />
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{artist.full_name}</Text>
                  <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                    {artist.primary_genre ?? 'Artist'}{artist.based_in ? ` · ${artist.based_in}` : ''}
                  </Text>
                  {artist.secondary_genres && artist.secondary_genres.length > 0 && (
                    <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
                      {artist.secondary_genres.slice(0, 3).join(' · ')}
                    </Text>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 0.5, marginTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: 12, borderWidth: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 13, marginBottom: 2 },
  cardMeta: { fontSize: 12 },
  applyBtn: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, minWidth: 70, alignItems: 'center',
  },
  applyBtnText: { fontSize: 13, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});