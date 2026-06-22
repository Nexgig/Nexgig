import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore, useNotificationStore, useVenueStore, usePendingAppsStore, useArtistDirectoryStore, useVenueDirectoryStore, mapVenueRow } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { AvatarImage } from '@/components/ui/avatar-image';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { supabase } from '@/lib/supabase';
import type { User, ArtistProfile, Venue } from '@/lib/types';

type NetworkTab = 'artists' | 'venues';

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
  const allVenues = useVenueStore((s) => s.venues);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);

  const [activeTab, setActiveTab] = useState<NetworkTab>(initialTab === 'venues' ? 'venues' : 'artists');
  // ── Applications state ────────────────────────────────────────────────────
  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'artists') { await fetchApplications(); await fetchArtists(); }
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

  // ── Fetch applications + artists on mount (Artists is the default tab) ─────
  useEffect(() => { fetchApplications(); }, []);

  // Keep the Network tab badge in sync with the live pending list so
  // accept/decline clears it instantly (no focus change / realtime needed).
  useEffect(() => {
    if (!appsLoading) setPendingCount(applications.length);
  }, [applications.length, appsLoading, setPendingCount]);

  // ── Fetch artists/venues when switching to that tab and data is empty ──────
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
    // Read public artist profiles from the artists table ONLY (it's world-readable
    // to authenticated users). We deliberately do NOT read the users table here —
    // it holds private PII (email, phone, push_token) and is locked to own-row.
    // The artists table carries everything the Network cards need (name, photo,
    // based_in, primary_genre, ...), all keyed by id = the artist's auth id.
    const { data } = await supabase.from('artists').select('*');
    if (data) {
      setSbArtists(data.map((a: any) => ({
        id: a.id, email: '', phone: '', accountType: 'artist' as const,
        fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined, bio: a.bio ?? undefined,
        location: a.based_in ?? undefined, yearsOfExperience: a.years_of_experience ?? undefined,
        isPhoneVerified: false, isEmailVerified: false,
        createdAt: a.created_at, updatedAt: a.updated_at,
      })));
      // sbProfiles is keyed by id (= user.id) so getProfile(user.id) matches and
      // the card genre subtitle renders (previously keyed by a non-existent
      // user_id, so primaryGenre always fell back to 'Artist').
      setSbProfiles(data.map((a: any) => ({
        userId: a.id, primaryGenre: a.primary_genre, secondaryGenres: a.secondary_genres ?? [],
        hasCompletedBooking: a.has_completed_booking ?? false,
        energyTypes: [], instruments: a.instruments ?? [],
        socialLinks: undefined, ratePerHour: a.min_rate ?? undefined, bio: a.bio ?? undefined,
        createdAt: a.created_at, updatedAt: a.updated_at,
      })));
      // Cache the FULL artist data in the shared directory store so tapping any artist
      // here opens their profile complete on the first frame (no fetch-on-open).
      useArtistDirectoryStore.getState().setArtists(data.map((a: any) => ({
        user: {
          id: a.id, email: '', phone: '', accountType: 'artist' as const,
          fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined, bio: a.bio ?? undefined,
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
          hasCompletedBooking: a.has_completed_booking ?? false,
          instagramUrl: a.instagram_url ?? undefined, soundcloudUrl: a.soundcloud_url ?? undefined,
          mixcloudUrl: a.mixcloud_url ?? undefined, spotifyUrl: a.spotify_url ?? undefined,
        },
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
        photoUrls: v.photo_urls ?? [],
        genrePreferences: v.genre_preferences ?? [], preferredEnergy: v.preferred_energy ?? [],
        googleMapsLocation: v.google_maps_location, color: v.color ?? '#2563EB',
        isHidden: v.is_hidden ?? false, isComplete: v.is_complete ?? false,
        verificationStatus: v.verification_status ?? 'pending',
        createdAt: v.created_at, updatedAt: v.updated_at,
      })));
      // Cache full venue data so tapping a venue opens its detail complete (no fetch-on-open).
      useVenueDirectoryStore.getState().setVenues(data.map((v: any) => mapVenueRow(v)));
    }
    setVenuesLoading(false);
  };

  const getProfile = (userId: string) => sbProfiles.find((p) => p.userId === userId);

  // Artist IDs with a pending application — shown at the top of the Artists tab
  const applicantIds = useMemo(
    () => new Set(applications.map((a) => a.artist_id)),
    [applications]
  );

  const filteredArtists = useMemo(
    () => [...sbArtists.filter((u) => u.id !== currentUser?.id && !applicantIds.has(u.id))]
      .sort((a, b) => (a.fullName ?? '').toLowerCase().localeCompare((b.fullName ?? '').toLowerCase())),
    [sbArtists, currentUser?.id, applicantIds]
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

  // ── Add an existing artist to the manager's roster + all current venues ────
  const handleAddToRoster = async (artist: User) => {
    if (!currentUser) return;
    setProcessingId(artist.id);

    const managerVenues = allVenues.filter((v) => v.managerId === currentUser.id && !v.isHidden);

    // 1. Roster row
    const { error: lineupError } = await supabase.from('global_lineup').upsert(
      { manager_id: currentUser.id, artist_id: artist.id, status: 'active' },
      { onConflict: 'manager_id,artist_id' }
    );
    if (lineupError) { setProcessingId(null); Alert.alert('Error', lineupError.message); return; }

    // 2. Assign to every current venue
    if (managerVenues.length > 0) {
      const rows = managerVenues.map((v) => ({
        manager_id: currentUser.id, artist_id: artist.id, venue_id: v.id, status: 'active',
      }));
      await supabase.from('venue_assignments').upsert(rows, { onConflict: 'venue_id,artist_id' });
    }

    // 3. Local store updates so the row flips to Connected immediately
    const lineupStore = useLineupStore.getState();
    lineupStore.addArtistUser({
      id: artist.id, email: artist.email ?? '', phone: '', accountType: 'artist' as const,
      fullName: artist.fullName ?? '', profilePhotoUrl: artist.profilePhotoUrl ?? undefined,
      isPhoneVerified: false, isEmailVerified: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    lineupStore.addToGlobalLineup({
      id: `${currentUser.id}-${artist.id}`, managerId: currentUser.id,
      artistId: artist.id, status: 'active' as const, addedAt: new Date().toISOString(),
    });
    managerVenues.forEach((v) => {
      lineupStore.assignToVenue({
        id: `va-${v.id}-${artist.id}`,
        globalLineupId: `${currentUser.id}-${artist.id}`,
        venueId: v.id, artistId: artist.id,
        assignedAt: new Date().toISOString(), status: 'active' as const,
      });
    });

    // 4. Informational notification to the artist
    const venueText = managerVenues.length > 0
      ? ` You've been added to ${managerVenues.length} venue${managerVenues.length > 1 ? 's' : ''}.`
      : '';
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artist.id,
      type: 'lineup_added' as any,
      title: 'Added to Roster',
      body: `${currentUser.fullName ?? 'A manager'} added you to their roster.${venueText}`,
      isRead: false,
      relatedId: currentUser.id,
      relatedType: 'manager',
      createdAt: new Date().toISOString(),
    });

    setProcessingId(null);
  };

  // ── Disconnect an artist from this manager (lineup + all venue assignments) ─
  const handleDisconnect = (artist: User) => {
    if (!currentUser) return;
    Alert.alert(
      'Disconnect Artist',
      `Disconnect ${artist.fullName}? They'll be removed from your lineup and all your venues.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: async () => {
          useLineupStore.getState().removeFromGlobalLineup(artist.id);
          // DELETE the rows (do NOT update status='removed' — that violates a check
          // constraint on venue_assignments and fails silently, so the artist returns
          // on the next re-sync / sign-in).
          const { error: glErr } = await supabase.from('global_lineup').delete()
            .eq('manager_id', currentUser.id).eq('artist_id', artist.id);
          if (glErr) console.warn('Failed to remove global_lineup row:', glErr.message);
          const { error: vaErr } = await supabase.from('venue_assignments').delete()
            .eq('manager_id', currentUser.id).eq('artist_id', artist.id);
          if (vaErr) console.warn('Failed to remove venue_assignments rows:', vaErr.message);
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artist.id,
            type: 'lineup_removed' as any,
            title: 'Removed from Lineup',
            body: `${currentUser.fullName ?? 'A manager'} removed you from their artist lineup.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Network</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Artists & venues</Text>
      </View>

      {/* Sub-tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['artists', 'venues'] as NetworkTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

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
            ListHeaderComponent={
              applications.length > 0 ? (
                <View style={{ gap: 12, marginBottom: 4 }}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>JOIN REQUESTS</Text>
                  {applications.map((app) => {
                    const isProcessing = processingId === app.id;
                    return (
                      <View key={app.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]}>
                        <View style={styles.cardTop}>
                          <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                            {app.artist?.profile_photo_url
                              ? <Image source={{ uri: app.artist.profile_photo_url }} style={styles.thumb} resizeMode="cover" />
                              : <MaterialIcons name="person" size={22} color={colors.muted} />}
                          </View>
                          <View style={styles.cardInfo}>
                            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{app.artist?.full_name ?? 'Unknown Artist'}</Text>
                            <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                              {app.artist?.primary_genre ?? 'Artist'}{app.artist?.based_in ? ` · ${app.artist.based_in}` : ''}
                            </Text>
                            <Text style={[styles.cardVenue, { color: colors.primary }]} numberOfLines={1}>→ wants to join {app.venue?.name ?? 'a venue'}</Text>
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
                  })}
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 8 }]}>ALL ARTISTS</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              applications.length > 0 ? null : (
                <View style={styles.emptyWrap}>
                  <MaterialIcons name="people" size={48} color={colors.muted} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Artists Found</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.muted }]}>No artists have signed up yet</Text>
                </View>
              )
            }
            renderItem={({ item: user }) => {
              const profile = getProfile(user.id);
              const isConnected = globalLineup.some(
                (r) => r.artistId === user.id && r.managerId === currentUser?.id && r.status === 'active'
              );
              const rowContent = (
                <Pressable
                  style={({ pressed }) => [styles.rowCard, { backgroundColor: colors.surface, borderColor: isConnected ? colors.success + '40' : colors.border, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + user.id + '&name=' + encodeURIComponent(user.fullName ?? '') + '&photo=' + encodeURIComponent(user.profilePhotoUrl ?? '') + '&genre=' + encodeURIComponent(profile?.primaryGenre ?? '')) as Href)}
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{user.fullName}</Text>
                        {profile?.hasCompletedBooking && (
                          <MaterialIcons name="verified" size={15} color={colors.primary} />
                        )}
                      </View>
                      <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                        {profile?.primaryGenre ?? 'Artist'}
                      </Text>
                    </View>
                  </View>
                  {isConnected ? (
                    <View style={[styles.addBtn, { backgroundColor: colors.success }]}>
                      <MaterialIcons name="check" size={16} color="#fff" />
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                      onPress={(e) => { e.stopPropagation?.(); handleAddToRoster(user); }}
                      disabled={processingId === user.id}
                      hitSlop={6}
                    >
                      {processingId === user.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <><MaterialIcons name="person-add" size={14} color="#fff" /><Text style={styles.addBtnText}>Add</Text></>}
                    </Pressable>
                  )}
                </Pressable>
              );
              if (isConnected) {
                return (
                  <Swipeable
                    renderRightActions={() => (
                      <Pressable
                        style={({ pressed }) => [styles.disconnectAction, { opacity: pressed ? 0.8 : 1 }]}
                        onPress={() => handleDisconnect(user)}
                      >
                        <MaterialIcons name="link-off" size={20} color="#fff" />
                        <Text style={styles.disconnectActionText}>Disconnect</Text>
                      </Pressable>
                    )}
                  >
                    {rowContent}
                  </Swipeable>
                );
              }
              return rowContent;
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
                    <View style={styles.titleRow}>
                      <Text style={[styles.cardTitle, { color: colors.foreground, flexShrink: 1, marginBottom: 0 }]} numberOfLines={1}>{venue.name}</Text>
                      {venue.verificationStatus === 'verified' && (
                        <MaterialIcons name="verified" size={15} color={colors.primary} />
                      )}
                    </View>
                    {venue.googleMapsLocation?.address ? (
                      <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                        {venue.googleMapsLocation.address}
                      </Text>
                    ) : null}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  verifiedPillText: { fontSize: 10, fontWeight: '700' },
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
  connectedWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disconnectIconBtn: { padding: 7, borderRadius: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, minWidth: 72 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  disconnectAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 96, borderRadius: 14, marginLeft: 8 },
  disconnectActionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
});