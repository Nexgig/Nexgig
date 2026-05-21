import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Image, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';
import { supabase } from '@/lib/supabase';
import type { Venue, User, ArtistProfile } from '@/lib/types';

type DiscoveryTab = 'venues' | 'artists';

export default function ArtistDiscoveryScreen() {
  const router = useRouter();
  const colors = useColors();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: DiscoveryTab }>();

  const [activeTab, setActiveTab] = useState<DiscoveryTab>(initialTab === 'artists' ? 'artists' : 'venues');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sbVenues, setSbVenues] = useState<Venue[]>([]);
  const [sbArtists, setSbArtists] = useState<User[]>([]);
  const [sbProfiles, setSbProfiles] = useState<ArtistProfile[]>([]);

  const currentUser = useAuthStore((s) => s.currentUser);
  // Fallback to store data while Supabase fetch is in progress
  const allVenues = useVenueStore((s) => s.venues);
  const artistUsers = useLineupStore((s) => s.artistUsers);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const [venuesRes, usersRes, profilesRes] = await Promise.all([
        supabase.from('venues').select('*').neq('is_hidden', true),
        supabase.from('users').select('*').eq('account_type', 'artist'),
        supabase.from('artists').select('*'),
      ]);
      if (cancelled) return;
      if (venuesRes.data) {
        setSbVenues(venuesRes.data.map((v: any) => ({
          id: v.id,
          managerId: v.manager_id,
          name: v.name,
          venueType: v.venue_type,
          description: v.description,
          photoUrls: v.photo_urls ?? [],
          genrePreferences: v.genre_preferences ?? [],
          energyPreferences: v.energy_preferences ?? [],
          googleMapsLocation: v.google_maps_location,
          isHidden: v.is_hidden ?? false,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
        })));
      }
      if (usersRes.data) {
        setSbArtists(usersRes.data.map((u: any) => ({
          id: u.id,
          email: u.email,
          phone: u.phone,
          accountType: u.account_type,
          fullName: u.full_name,
          profilePhotoUrl: u.profile_photo_url,
          bio: u.bio,
          location: u.location,
          yearsOfExperience: u.years_of_experience,
          isPhoneVerified: u.is_phone_verified ?? false,
          isEmailVerified: u.is_email_verified ?? false,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        })));
      }
      if (profilesRes.data) {
        setSbProfiles(profilesRes.data.map((p: any) => ({
          userId: p.user_id,
          primaryGenre: p.primary_genre,
          secondaryGenres: p.secondary_genres ?? [],
          energyTypes: p.energy_types ?? [],
          instruments: p.instruments ?? [],
          socialLinks: p.social_links,
          ratePerHour: p.rate_per_hour,
          bio: p.bio,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })));
      }
      setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const getProfile = (userId: string) => sbProfiles.find((p) => p.userId === userId);

  // Use Supabase data if loaded, otherwise fall back to store
  const discoveryVenues = useMemo(
    () => (sbVenues.length > 0 ? sbVenues : allVenues.filter((v) => !v.isHidden)),
    [sbVenues, allVenues]
  );

  const discoveryArtists = useMemo(
    () => (sbArtists.length > 0 ? sbArtists : artistUsers).filter((u) => u.id !== currentUser?.id),
    [sbArtists, artistUsers, currentUser?.id]
  );

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = q
      ? discoveryVenues.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.venueType?.toLowerCase().includes(q) ||
            v.googleMapsLocation?.address?.toLowerCase().includes(q)
        )
      : discoveryVenues;
    return [...results].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [discoveryVenues, search]);

  const filteredArtists = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = q
      ? discoveryArtists.filter((u) => {
          const profile = getProfile(u.id);
          return (
            u.fullName?.toLowerCase().includes(q) ||
            profile?.primaryGenre?.toLowerCase().includes(q) ||
            u.location?.toLowerCase().includes(q)
          );
        })
      : discoveryArtists;
    return [...results].sort((a, b) => (a.fullName ?? '').toLowerCase().localeCompare((b.fullName ?? '').toLowerCase()));
  }, [discoveryArtists, search, sbProfiles]);

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.foreground }]}>Discovery</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Venues & Artists</Text>
        </View>
        <View style={styles.backBtn} />
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
        {(['venues', 'artists'] as DiscoveryTab[]).map((tab) => (
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

      {/* Content */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading...</Text>
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
          renderItem={({ item: venue }) => (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(artist)/venue-detail?id=' + venue.id) as Href)}
            >
              <View style={styles.cardLeft}>
                {venue.photoUrls && venue.photoUrls.length > 0 ? (
                  <Image source={{ uri: venue.photoUrls[0] }} style={[styles.thumb, { borderColor: colors.border }]} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialIcons name="place" size={22} color={colors.muted} />
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
                  <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                    {venue.venueType}{venue.googleMapsLocation?.address ? ` · ${venue.googleMapsLocation.address}` : ''}
                  </Text>
                  {venue.genrePreferences && venue.genrePreferences.length > 0 && (
                    <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
                      {venue.genrePreferences.slice(0, 3).join(' · ')}
                    </Text>
                  )}
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
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
          renderItem={({ item: user }) => {
            const profile = getProfile(user.id);
            return (
              <Pressable
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(artist)/artist-profile-view?artistId=' + user.id) as Href)}
              >
                <View style={styles.cardLeft}>
                  <AvatarImage uri={user.profilePhotoUrl} name={user.fullName} size={48} />
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{user.fullName}</Text>
                    <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                      {profile?.primaryGenre ?? 'Artist'}{user.location ? ` · ${user.location}` : ''}
                    </Text>
                    {profile?.secondaryGenres && profile.secondaryGenres.length > 0 && (
                      <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
                        {profile.secondaryGenres.slice(0, 3).join(' · ')}
                      </Text>
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
});
