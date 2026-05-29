import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';
import { supabase } from '@/lib/supabase';
import type { User, ArtistProfile, Venue } from '@/lib/types';

type NetworkTab = 'applications' | 'artists' | 'venues';

type Application = {
  id: string;
  artist_id: string;
  venue_id: string;
  status: string;
  created_at: string;
  artist: { full_name: string; primary_genre: string; based_in: string; profile_photo_url: string } | null;
  venue: { name: string } | null;
};

export default function NetworkScreen() {
  const router = useRouter();
  const colors = useColors();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: NetworkTab }>();
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const currentUser = useAuthStore((s) => s.currentUser);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [activeTab, setActiveTab] = useState<NetworkTab>(initialTab === 'artists' || initialTab === 'venues' ? initialTab : 'applications');
  // ── Applications state ────────────────────────────────────────────────────
  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'applications') await fetchApplications();
    else if (activeTab === 'artists') await fetchArtists();
    else await fetchVenues();
    setRefreshing(false);
  }, [activeTab]);

  // ── Artists state ─────────────────────────────────────────────────────────
  const [sbArtists, setSbArtists] = useState<User[]>([]);
  const [sbProfiles, setSbProfiles] = useState<ArtistProfile[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);

  // ── Venues state ──────────────────────────────────────────────────────────
  const [sbVenues, setSbVenues] = useState<Venue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);

  // ── Fetch applications on mount ───────────────────────────────────────────
  useEffect(() => { fetchApplications(); }, []);

  // ── Fetch artists/venues only when switching to that tab and data is empty ─
  useEffect(() => {
    if (activeTab === 'artists' && sbArtists.length === 0) fetchArtists();
    if (activeTab === 'venues' && sbVenues.length === 0) fetchVenues();
  }, [activeTab]);

  const fetchApplications = async () => {
    if (!currentUser) return;
    setAppsLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('id, artist_id, venue_id, status, created_at')
      .eq('manager_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      const artistIds = data.map((a) => a.artist_id);
      const venueIds = data.map((a) => a.venue_id);
      const [{ data: artistsData }, { data: venuesData }] = await Promise.all([
        supabase.from('artists').select('id, full_name, primary_genre, based_in, profile_photo_url').in('id', artistIds),
        supabase.from('venues').select('id, name').in('id', venueIds),
      ]);
      const artistMap = Object.fromEntries((artistsData ?? []).map((a) => [a.id, a]));
      const venueMap = Object.fromEntries((venuesData ?? []).map((v) => [v.id, v]));
      setApplications(data.map((app) => ({ ...app, artist: artistMap[app.artist_id] ?? null, venue: venueMap[app.venue_id] ?? null })) as any);
    } else {
      setApplications([]);
    }
    setAppsLoading(false);
  };

  const fetchArtists = async () => {
    setArtistsLoading(true);
    const [usersRes, profilesRes] = await Promise.all([
      supabase.from('users').select('*').eq('account_type', 'artist'),
      supabase.from('artists').select('*'),
    ]);
    if (usersRes.data) {
      setSbArtists(usersRes.data.map((u: any) => ({
        id: u.id, email: u.email, phone: u.phone, accountType: u.account_type,
        fullName: u.full_name, profilePhotoUrl: u.profile_photo_url, bio: u.bio,
        location: u.location, yearsOfExperience: u.years_of_experience,
        isPhoneVerified: u.is_phone_verified ?? false, isEmailVerified: u.is_email_verified ?? false,
        createdAt: u.created_at, updatedAt: u.updated_at,
      })));
    }
    if (profilesRes.data) {
      setSbProfiles(profilesRes.data.map((p: any) => ({
        userId: p.user_id, primaryGenre: p.primary_genre, secondaryGenres: p.secondary_genres ?? [],
        energyTypes: p.energy_types ?? [], instruments: p.instruments ?? [],
        socialLinks: p.social_links, ratePerHour: p.rate_per_hour, bio: p.bio,
        createdAt: p.created_at, updatedAt: p.updated_at,
      })));
    }
    setArtistsLoading(false);
  };

  const fetchVenues = async () => {
    setVenuesLoading(true);
    const { data } = await supabase.from('venues').select('*').neq('is_hidden', true);
    if (data) {
      setSbVenues(data.map((v: any) => ({
        id: v.id, managerId: v.manager_id, name: v.name, venueType: v.venue_type,
        description: v.description, photoUrls: v.photo_urls ?? [],
        genrePreferences: v.genre_preferences ?? [], energyPreferences: v.energy_preferences ?? [],
        googleMapsLocation: v.google_maps_location, isHidden: v.is_hidden ?? false,
        createdAt: v.created_at, updatedAt: v.updated_at,
      })));
    }
    setVenuesLoading(false);
  };

  const getProfile = (userId: string) => sbProfiles.find((p) => p.userId === userId);

  const filteredArtists = useMemo(
    () => [...sbArtists.filter((u) => u.id !== currentUser?.id)]
      .sort((a, b) => (a.fullName ?? '').toLowerCase().localeCompare((b.fullName ?? '').toLowerCase())),
    [sbArtists, currentUser?.id]
  );

  const filteredVenues = useMemo(
    () => [...sbVenues].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [sbVenues]
  );

  // ── Accept / Decline handlers ─────────────────────────────────────────────
  const handleAccept = async (app: Application) => {
    Alert.alert('Accept Application', `Accept ${app.artist?.full_name} for ${app.venue?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          if (!currentUser) return;
          setProcessingId(app.id);
          const { error } = await supabase.from('applications')
            .update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', app.id);
          if (error) { setProcessingId(null); Alert.alert('Error', error.message); return; }
          await supabase.from('global_lineup').upsert(
            { manager_id: currentUser.id, artist_id: app.artist_id, status: 'active' },
            { onConflict: 'manager_id,artist_id' }
          );
          await supabase.from('venue_assignments').upsert(
            { manager_id: currentUser.id, artist_id: app.artist_id, venue_id: app.venue_id, status: 'active' },
            { onConflict: 'venue_id,artist_id' }
          );
          const lineupStore = useLineupStore.getState();
          lineupStore.addArtistUser({
            id: app.artist_id, email: '', phone: '', accountType: 'artist' as const,
            fullName: app.artist?.full_name ?? '', profilePhotoUrl: app.artist?.profile_photo_url ?? undefined,
            isPhoneVerified: false, isEmailVerified: true,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
          lineupStore.addToGlobalLineup({
            id: `${currentUser.id}-${app.artist_id}`, managerId: currentUser.id,
            artistId: app.artist_id, status: 'active' as const, addedAt: new Date().toISOString(),
          });
          lineupStore.assignToVenue({
            id: `va-${app.venue_id}-${app.artist_id}`,
            globalLineupId: `${currentUser.id}-${app.artist_id}`,
            venueId: app.venue_id, artistId: app.artist_id,
            assignedAt: new Date().toISOString(), status: 'active' as const,
          });
          setProcessingId(null);
          setApplications((prev) => prev.filter((a) => a.id !== app.id));
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: app.artist_id,
            type: 'lineup_added' as any,
            title: 'Application Accepted',
            body: `Your request to join the lineup at ${app.venue?.name ?? 'the venue'} has been accepted.`,
            isRead: false,
            relatedId: app.venue_id,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
          Alert.alert('Accepted!', `${app.artist?.full_name} has been added to your lineup.`);
        },
      },
    ]);
  };

  const handleDecline = async (app: Application) => {
    Alert.alert('Decline Application', `Decline ${app.artist?.full_name} for ${app.venue?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setProcessingId(app.id);
          const { error } = await supabase.from('applications')
            .update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', app.id);
          setProcessingId(null);
          if (error) Alert.alert('Error', error.message);
          else setApplications((prev) => prev.filter((a) => a.id !== app.id));
        },
      },
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Network</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Artists, venues & applications</Text>
      </View>

      {/* Sub-tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['applications', 'artists', 'venues'] as NetworkTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab === 'applications' ? `Applications${applications.length > 0 ? ` (${applications.length})` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Applications tab */}
      {activeTab === 'applications' && (
        appsLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={applications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <MaterialIcons name="inbox" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Applications</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Artists who apply to your venues will appear here</Text>
              </View>
            }
            renderItem={({ item: app }) => {
              const isProcessing = processingId === app.id;
              return (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                      <MaterialIcons name="person" size={22} color={colors.muted} />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{app.artist?.full_name ?? 'Unknown Artist'}</Text>
                      <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                        {app.artist?.primary_genre ?? 'Artist'}{app.artist?.based_in ? ` · ${app.artist.based_in}` : ''}
                      </Text>
                      <Text style={[styles.cardVenue, { color: colors.primary }]} numberOfLines={1}>→ {app.venue?.name ?? 'Unknown Venue'}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable style={[styles.declineBtn, { borderColor: colors.border }]} onPress={() => handleDecline(app)} disabled={isProcessing}>
                      <Text style={[styles.declineBtnText, { color: colors.muted }]}>Decline</Text>
                    </Pressable>
                    <Pressable style={[styles.acceptBtn, { backgroundColor: colors.primary }]} onPress={() => handleAccept(app)} disabled={isProcessing}>
                      {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                    </Pressable>
                  </View>
                </View>
              );
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
            data={filteredArtists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <MaterialIcons name="people" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Artists Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>No artists have signed up yet</Text>
              </View>
            }
            renderItem={({ item: user }) => {
              const profile = getProfile(user.id);
              const isConnected = globalLineup.some(
                (r) => r.artistId === user.id && r.managerId === currentUser?.id && r.status === 'active'
              );
              return (
                <Pressable
                  style={({ pressed }) => [styles.rowCard, { backgroundColor: colors.surface, borderColor: isConnected ? colors.success + '40' : colors.border, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + user.id) as Href)}
                >
                  <View style={styles.cardLeft}>
                    {user.profilePhotoUrl ? (
                      <Image source={{ uri: user.profilePhotoUrl }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                        <MaterialIcons name="person" size={22} color={colors.muted} />
                      </View>
                    )}
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
                  {isConnected ? (
                    <View style={[styles.connectedBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}>
                      <MaterialIcons name="check-circle" size={12} color={colors.success} />
                      <Text style={[styles.connectedText, { color: colors.success }]}>Connected</Text>
                    </View>
                  ) : (
                    <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                  )}
                </Pressable>
              );
            }}
          />
        )
      )}

      {/* Venues tab */}
      {activeTab === 'venues' && (
        venuesLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={filteredVenues}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <MaterialIcons name="place" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Venues Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>No venues available yet</Text>
              </View>
            }
            renderItem={({ item: venue }) => (
              <Pressable
                style={({ pressed }) => [styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                onPress={() => router.push(('/(manager)/venue-detail?id=' + venue.id) as Href)}
              >
                <View style={styles.cardLeft}>
                  {venue.photoUrls && venue.photoUrls.length > 0 ? (
                    <Image source={{ uri: venue.photoUrls[0] }} style={styles.thumb} resizeMode="cover" />
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
        )
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 14 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 13, marginBottom: 2 },
  cardMeta: { fontSize: 12 },
  cardVenue: { fontSize: 13, fontWeight: '600' },
  thumb: { width: 48, height: 48, borderRadius: 12, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600' },
  acceptBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  connectedText: { fontSize: 11, fontWeight: '700' },
});