import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useLineupStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';

type DiscoveryTab = 'venues' | 'artists';

export default function DiscoveryScreen() {
  const router = useRouter();
  const colors = useColors();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: DiscoveryTab }>();

  const [activeTab, setActiveTab] = useState<DiscoveryTab>(initialTab === 'artists' ? 'artists' : 'venues');
  const [search, setSearch] = useState('');

  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const artistUsers = useLineupStore((s) => s.artistUsers);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);

  // All active (non-hidden) venues
  const discoveryVenues = useMemo(
    () => allVenues.filter((v) => !v.isHidden),
    [allVenues]
  );

  // All signed-up artists
  const discoveryArtists = useMemo(
    () => artistUsers.filter((u) => u.id !== currentUser?.id),
    [artistUsers, currentUser?.id]
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
          const profile = getArtistProfile(u.id);
          return (
            u.fullName?.toLowerCase().includes(q) ||
            profile?.primaryGenre?.toLowerCase().includes(q) ||
            u.location?.toLowerCase().includes(q)
          );
        })
      : discoveryArtists;
    return [...results].sort((a, b) => (a.fullName ?? '').toLowerCase().localeCompare((b.fullName ?? '').toLowerCase()));
  }, [discoveryArtists, search, getArtistProfile]);

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
      {activeTab === 'venues' ? (
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
                {search ? 'Try a different search term' : 'No other venues available yet'}
              </Text>
            </View>
          }
          renderItem={({ item: venue }) => (
            <Pressable
              style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
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
            const profile = getArtistProfile(user.id);
            return (
              <Pressable
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + user.id) as Href)}
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
});
