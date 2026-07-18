import { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, Alert, Modal, Image, ActivityIndicator, Animated } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Section, Divider, StatRow, Chip } from '@/components/ui/card-free';
import { useLineupStore, useBookingStore, useVenueStore, useAuthStore, useSlotStore, useNotificationStore, useArtistDirectoryStore } from '@/lib/store';
import { fonts } from '@/lib/fonts';
import { SHOW_ARTIST_HISTORY } from '@/lib/features';
import { ArtistBookingsList } from '@/components/artist-bookings-list';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { COUNTRIES } from '@/components/country-picker';
import { ReportModal } from '@/components/report-modal';
import { supabase } from '@/lib/supabase';
import type { VenueAssignment } from '@/lib/types';

function formatMemberSince(createdAt?: string): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Shimmer placeholder shown while artist data is still loading (Option 3).
function Skeleton({ width, height, radius = 6, color, style }: { width: number; height: number; radius?: number; color: string; style?: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: color, opacity }, style]} />;
}

export default function ArtistProfileViewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId, name: paramName, photo: paramPhoto, genre: paramGenre } = useLocalSearchParams<{ artistId: string; name?: string; photo?: string; genre?: string }>();

  // ── Stores ────────────────────────────────────────────────────────────────
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const removeFromGlobalLineup = useLineupStore((s) => s.removeFromGlobalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);
  const currentUser = useAuthStore((s) => s.currentUser);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // ── Assign Venue sheet state ──────────────────────────────────────────────
  const [showAssignSheet, setShowAssignSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // ── Invite state ──────────────────────────────────────────────────────────
  const isConnected = useMemo(
    () => globalLineup.some((r) => r.artistId === artistId && r.managerId === currentUser?.id && r.status === 'active'),
    [globalLineup, artistId, currentUser?.id]
  );

  // Bookings lives here rather than on its own screen (the old artist-bookings route).
  // Only meaningful for a connected artist — see the tab bar's isConnected gate.
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings'>('overview');

  // ── Derived data ──────────────────────────────────────────────────────────
  const myVenues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );

  const activeAssignments = useMemo(
    () => venueAssignments.filter((a) => a.status === 'active'),
    [venueAssignments]
  );

  const assignedVenueIds = useMemo(
    () => activeAssignments.filter((a) => a.artistId === artistId).map((a) => a.venueId),
    [activeAssignments, artistId]
  );

  const unassignedVenues = useMemo(
    () => myVenues.filter((v) => !assignedVenueIds.includes(v.id)),
    [myVenues, assignedVenueIds]
  );

  const assignedVenues = useMemo(
    () => myVenues.filter((v) => assignedVenueIds.includes(v.id)),
    [myVenues, assignedVenueIds]
  );

  const bookings = useMemo(
    () => allBookings.filter((b) => b.artistId === artistId && b.managerId === currentUser?.id),
    [allBookings, artistId, currentUser?.id]
  );

  // This artist's GLOBAL completed gigs (venue + date + times only) via the public RPC,
  // so the manager sees the same numbers as everyone else — not just gigs at their own venues.
  const [publicGigs, setPublicGigs] = useState<{ venue_name: string; gig_date: string; start_time: string; end_time: string }[]>([]);
  useEffect(() => {
    if (!artistId) return;
    supabase.rpc('get_artist_public_gigs', { p_artist_id: artistId })
      .then(({ data }) => { if (Array.isArray(data)) setPublicGigs(data as any); });
  }, [artistId]);

  const djFromStore = getArtistUser(artistId ?? '');
  const profileFromStore = getArtistProfile(artistId ?? '');
  // Full data cached when the manager browsed the Network list — lets this page open
  // complete on the first frame (no fetch-on-open second pass). Subscribes to entries
  // so it updates if the directory loads after mount.
  const dirEntry = useArtistDirectoryStore((s) => (artistId ? s.entries[artistId] : undefined));

  // If artist isn't in local store (not on lineup), fetch from Supabase
  const [fetchedUser, setFetchedUser] = useState<any>(null);
  const [fetchedProfile, setFetchedProfile] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (!artistId) return;
    // Always fetch the artists row (the source of truth) so bio/years show even for
    // artists already in the lineup — the local store user object doesn't carry them.
    if (!djFromStore) setIsFetching(true);
    // Read the public profile from the artists table only (world-readable to
    // authenticated users). The artists row carries name/photo/bio/based_in/years
    // plus genre/links — so we no longer read the users table here (private PII,
    // now locked to own-row). Also fixes the old query: artists is keyed by id and
    // has no user_id column, so the previous .eq('user_id', …) returned nothing.
    supabase.from('artists').select('*').eq('id', artistId).maybeSingle()
      .then(({ data: p }) => {
        if (p) {
          setFetchedUser({
            id: p.id, email: p.email ?? '', phone: p.phone ?? '', accountType: 'artist',
            fullName: p.full_name, profilePhotoUrl: p.profile_photo_url,
            avatarId: p.avatar_id ?? undefined,
            bio: p.bio, location: p.based_in, yearsOfExperience: p.years_of_experience ?? undefined,
            isPhoneVerified: false, isEmailVerified: false,
            createdAt: p.created_at, updatedAt: p.updated_at,
          });
          setFetchedProfile({
            userId: p.id, primaryGenre: p.primary_genre,
            secondaryGenres: Array.isArray(p.secondary_genres) ? p.secondary_genres : [],
            instruments: Array.isArray(p.instruments) ? p.instruments : [],
            bio: p.bio,
            basedIn: p.based_in, nationality: p.nationality,
            minRate: p.min_rate ?? undefined,
            gender: p.gender ?? undefined,
            isHistoryHidden: p.is_history_hidden ?? false,
            hasCompletedBooking: p.has_completed_booking ?? false,
            instagramUrl: p.instagram_url ?? undefined,
            soundcloudUrl: p.soundcloud_url ?? undefined,
            mixcloudUrl: p.mixcloud_url ?? undefined,
            spotifyUrl: p.spotify_url ?? undefined,
            createdAt: p.created_at, updatedAt: p.updated_at,
          });
        }
        setIsFetching(false);
        setHasFetched(true);
      });
  }, [artistId]);

  // We have lower-section data to show instantly for lineup artists (from the store) or
  // once the fetch lands for Network/deep-link artists. Until then we render shimmer
  // skeletons in place of the stats/bio/genres cards (Instagram-style).
  const contentReady = hasFetched || !!dirEntry;

  // Instant paint: prefer freshly-fetched Supabase data (carries bio/years), then the
  // local store (lineup artists), then the name/photo/genre passed as route params from
  // the Network card — so a non-lineup artist's hero shows immediately (Instagram-style)
  // instead of waiting on the fetch.
  const paramDj = (paramName || paramPhoto)
    ? ({ id: artistId ?? '', fullName: paramName ?? '', profilePhotoUrl: paramPhoto || undefined, accountType: 'artist' } as any)
    : null;
  const paramProfile = paramGenre ? ({ userId: artistId ?? '', primaryGenre: paramGenre } as any) : null;
  const resolvedDj = fetchedUser ?? dirEntry?.user ?? djFromStore ?? paramDj;
  const resolvedProfile = fetchedProfile ?? dirEntry?.profile ?? profileFromStore ?? paramProfile;

  // All completed bookings with slot/venue snapshot fallback
  const completedBookings = useMemo(() => {
    return bookings
      .filter((b) => b.isCompleted || b.status === 'completed')
      .map((b) => {
        const slot = allSlots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId, venueId: b.venueId, date: b.slotDate,
          name: b.slotName ?? '', startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '', createdAt: b.createdAt,
        } : undefined);
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
        return { ...b, slot: resolvedSlot, venue: resolvedVenue };
      })
      .filter((b) => b.slot?.date)
      .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1);
  }, [bookings, allSlots, allVenues]);

  // Monthly Plays: completed gigs in the last 30 days (global, from the public RPC).
  const monthlyPlays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return publicGigs.filter((g) => g.gig_date && new Date(g.gig_date) >= cutoff).length;
  }, [publicGigs]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Connect this artist to the manager's roster + all current venues. Mirrors the
  // handleAddToRoster that used to live on the Network row (the ± button replaces it).
  const handleConnect = () => {
    if (!currentUser || !artistId || !dj) return;
    Alert.alert(
      'Add Artist',
      `Add ${dj.fullName || 'this artist'} to your lineup and all your venues?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => { void doConnect(); } },
      ]
    );
  };

  const doConnect = async () => {
    if (!currentUser || !artistId || !dj) return;
    const { error: lineupError } = await supabase.from('global_lineup').upsert(
      { manager_id: currentUser.id, artist_id: artistId, status: 'active' },
      { onConflict: 'manager_id,artist_id' }
    );
    if (lineupError) { Alert.alert('Error', lineupError.message); return; }
    if (myVenues.length > 0) {
      await supabase.from('venue_assignments').upsert(
        myVenues.map((v) => ({ manager_id: currentUser.id, artist_id: artistId, venue_id: v.id, status: 'active' })),
        { onConflict: 'venue_id,artist_id' }
      );
    }
    const ls = useLineupStore.getState();
    ls.addArtistUser({
      id: artistId, email: dj.email ?? '', phone: '', accountType: 'artist' as const,
      fullName: dj.fullName ?? '', profilePhotoUrl: dj.profilePhotoUrl ?? undefined,
      isPhoneVerified: false, isEmailVerified: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    ls.addToGlobalLineup({
      id: `${currentUser.id}-${artistId}`, managerId: currentUser.id,
      artistId, status: 'active' as const, addedAt: new Date().toISOString(),
    });
    myVenues.forEach((v) => ls.assignToVenue({
      id: `va-${v.id}-${artistId}`, globalLineupId: `${currentUser.id}-${artistId}`,
      venueId: v.id, artistId, assignedAt: new Date().toISOString(), status: 'active' as const,
    }));
    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artistId, type: 'lineup_added',
      title: 'Added to Lineup', body: `${currentUser.fullName ?? 'A manager'}`,
      isRead: false, createdAt: new Date().toISOString(),
    });
  };

  const handleRemove = () => {
    if (!dj) return;
    const completedCount = completedBookings.length;
    const message = completedCount > 0
      ? `${dj.fullName} has ${completedCount} completed gig${completedCount > 1 ? 's' : ''} on record. Their history will be preserved. This will remove them from your lineup and all venues.`
      : `Remove ${dj.fullName} from your lineup? This will also remove them from all venues.`;
    Alert.alert('Remove from Lineup', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          removeFromGlobalLineup(artistId ?? '');
          // Persist the removal to Supabase: delete the global lineup row AND all of this
          // manager's venue assignments for the artist. Without this, the local store
          // reverts on the next re-sync and the artist reappears as connected.
          if (currentUser?.id && artistId) {
            const { error: glErr } = await supabase.from('global_lineup').delete().eq('manager_id', currentUser.id).eq('artist_id', artistId);
            if (glErr) console.warn('Failed to remove global_lineup row:', glErr.message);
            const { error: vaErr } = await supabase.from('venue_assignments').delete().eq('manager_id', currentUser.id).eq('artist_id', artistId);
            if (vaErr) console.warn('Failed to remove venue_assignments rows:', vaErr.message);
          }
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId ?? '',
            type: 'lineup_removed',
            title: 'Removed from Lineup',
            body: `${currentUser?.fullName ?? 'A manager'}`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
          // Stay on the profile — the header button just flips back to +.
        },
      },
    ]);
  };

  const handleAddToVenue = (venueId: string) => {
    const venueName = myVenues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = dj?.fullName ?? 'Artist';
    Alert.alert('Add to Venue', `Add ${djName} to ${venueName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add', onPress: () => {
          const grEntry = globalLineup.find((r) => r.artistId === artistId);
          const newAssignment: VenueAssignment = {
            id: `va-${Date.now()}`,
            globalLineupId: grEntry?.id ?? '',
            venueId,
            artistId: artistId ?? '',
            assignedAt: new Date().toISOString(),
            status: 'active',
          };
          assignToVenue(newAssignment);
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId ?? '',
            type: 'venue_assigned',
            title: 'Assigned to Venue',
            body: `${venueName}`,
            isRead: false,
            relatedId: venueId,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  const handleRemoveFromVenue = (venueId: string) => {
    const venueName = myVenues.find((v) => v.id === venueId)?.name ?? 'venue';
    const djName = dj?.fullName ?? 'Artist';
    Alert.alert('Remove from Venue', `Remove ${djName} from ${venueName}? They will stay on your global lineup.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          removeFromVenue(venueId, artistId ?? '');
          // Persist to Supabase: delete this specific venue assignment row.
          if (currentUser?.id && artistId) {
            const { error } = await supabase.from('venue_assignments').delete().eq('manager_id', currentUser.id).eq('artist_id', artistId).eq('venue_id', venueId);
            if (error) console.warn('Failed to remove venue_assignment:', error.message);
          }
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId ?? '',
            type: 'venue_removed',
            title: 'Removed from Venue',
            body: `${venueName}`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  // Render the page shell immediately in BOTH cases (lineup and non-lineup) and let
  // data fill in when the fetch lands, so the screen opens the same way regardless of
  // whether the artist was already cached locally. Only show "not found" once a fetch
  // has actually completed with no row — otherwise we'd flash it before data arrives.
  if (!resolvedDj && hasFetched) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Artist not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  // When we have no identity at all yet (e.g. opened from a deep link with no cached
  // data and the fetch hasn't landed), show shimmer skeletons instead of an empty hero.
  const loading = !resolvedDj;
  const dj = resolvedDj ?? ({ id: artistId ?? '', fullName: '', accountType: 'artist' } as any);
  const profile = resolvedProfile;

  const completedGigs = publicGigs.length;
  const last5Gigs = publicGigs.slice(0, 5);
  const basedInCountry = profile?.basedIn ? COUNTRIES.find((c) => c.name === profile.basedIn) : undefined;
  const mediaLinks = profile?.mediaLinks ?? {
    soundcloud: profile?.soundcloudUrl,
    mixcloud: profile?.mixcloudUrl,
    instagram: profile?.instagramUrl,
    spotify: profile?.spotifyUrl,
  };
  // Drop the primary — it already has its own chip — and any repeats.
  const secondaryGenres: string[] = [...new Set<string>(profile?.secondaryGenres ?? [])].filter((g) => g !== profile?.primaryGenre);
  const instruments: string[] = profile?.instruments ?? [];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Artist Profile</Text>
          {/* Connect / disconnect, moved here from the Network row. + coral to connect,
              − muted (circled) when connected. Report flag hidden for now. */}
          <Pressable
            onPress={isConnected ? handleRemove : handleConnect}
            style={({ pressed }) => [
              styles.connectBtn,
              { borderColor: isConnected ? colors.muted : colors.primary, opacity: pressed ? 0.6 : 1 },
            ]}
            hitSlop={8}
          >
            <MaterialIcons
              name={isConnected ? 'remove' : 'add'}
              size={18}
              color={isConnected ? colors.muted : colors.primary}
              style={{ fontWeight: 'bold' }}
            />
          </Pressable>
        </View>

        {/* 1. Profile Hero: photo, name, location, member since */}
        <View style={styles.hero}>
          {loading ? (
            <Skeleton width={80} height={80} radius={40} color={colors.border} />
          ) : (
            <AvatarImage uri={dj.profilePhotoUrl || undefined} avatarId={(dj as any).avatarId ?? undefined} seed={dj.id} name={dj.fullName} size={80} />
          )}
          {loading ? (
            <Skeleton width={150} height={20} radius={6} color={colors.border} style={{ marginTop: 10 }} />
          ) : (
            <View style={styles.nameRow}>
              {profile?.hasCompletedBooking ? (
                <MaterialIcons name="verified" size={18} color="transparent" style={{ marginRight: 6 }} />
              ) : null}
              <Text style={[styles.djName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                {dj.fullName}
              </Text>
              {profile?.hasCompletedBooking ? (
                <MaterialIcons name="verified" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
              ) : null}
            </View>
          )}
        </View>

        {contentReady ? (
        <>
        {/* Tab Bar — Bookings only for artists in this manager's lineup. Mirrors
            venue-detail, which gates its tabs behind isOwner: an artist you're not
            connected to has no bookings with you, so the tab would always be empty. */}
        {isConnected && (
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['overview', 'bookings'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                  {tab === 'overview' ? 'Overview' : 'Bookings'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === 'bookings' && isConnected && (
          <ArtistBookingsList artistId={artistId ?? ''} />
        )}

        {(activeTab === 'overview' || !isConnected) && (
        <>
        {/* 2. Stats: Monthly Plays + Completed Gigs */}
        <StatRow
          items={[
            { value: monthlyPlays, label: 'Monthly Plays' },
            { value: completedGigs, label: 'Completed Gigs' },
          ]}
        />

        <Divider />

        <View style={styles.content}>
          {/* 3. Bio — only if filled */}
          {dj.bio ? (
            <>
              <Section label="Bio">
                <Text style={[styles.cardText, { color: colors.foreground }]}>{dj.bio}</Text>
              </Section>
            </>
          ) : null}

          {/* 4. Music Genres */}
          {profile ? (
            <>
              <Section label="Music Genres">
                <View style={styles.chipRow}>
                  <Chip label={profile.primaryGenre ?? ''} selected />
                  {secondaryGenres.map((g) => <Chip key={g} label={g} />)}
                </View>
              </Section>
            </>
          ) : null}

          {/* 5. Instruments */}
          {instruments.length > 0 ? (
            <>
              <Section label="Instruments">
                <View style={styles.chipRow}>
                  {instruments.map((i) => <Chip key={i} label={i} />)}
                </View>
              </Section>
            </>
          ) : null}

          {/* Links — text-only rows, no trailing separator on the last one */}
          {(mediaLinks.instagram || mediaLinks.soundcloud || mediaLinks.spotify) && (() => {
            const links = [
              mediaLinks.instagram && { key: 'instagram', label: 'Instagram', url: mediaLinks.instagram },
              mediaLinks.soundcloud && { key: 'soundcloud', label: 'SoundCloud', url: mediaLinks.soundcloud },
              mediaLinks.spotify && { key: 'spotify', label: 'Spotify', url: mediaLinks.spotify },
            ].filter(Boolean) as { key: string; label: string; url: string }[];

            return (
              <>
                <Section label="Links">
                  <View style={styles.linksCol}>
                    {links.map((l, i) => (
                      <Pressable
                        key={l.key}
                        style={({ pressed }) => [
                          styles.linkRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: StyleSheet.hairlineWidth * 2,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => Linking.openURL(l.url)}
                      >
                        <Text style={[styles.linkRowText, { color: colors.foreground }]}>{l.label}</Text>
                        <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                </Section>
              </>
            );
          })()}

          {/* 6. Last 5 completed gigs — hidden if artist set isHistoryHidden */}
          {SHOW_ARTIST_HISTORY && !profile?.isHistoryHidden && (
          <>
          <View style={styles.gigHistorySection}>
            <View style={[styles.collapseHeader, { borderColor: colors.border }]}>
              <View style={styles.collapseHeaderLeft}>
                <MaterialIcons name="history" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <Text style={[styles.collapseTitle, { color: colors.foreground }]}>History</Text>
                <View style={[styles.collapseBadge, { backgroundColor: colors.muted + '22' }]}>
                  <Text style={[styles.collapseBadgeText, { color: colors.muted }]}>{completedGigs}</Text>
                </View>
              </View>
            </View>
            {last5Gigs.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="history" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No completed gigs yet</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.gigHistoryScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.monthTable}>
                  {last5Gigs.map((gig, idx) => (
                    <View
                      key={idx}
                      style={[styles.bookingSubRow, { borderTopColor: colors.border }, idx === 0 && { borderTopWidth: 0 }]}
                    >
                      <View style={styles.bookingSubLeft}>
                        <View style={[styles.bookingSubDot, { backgroundColor: colors.success + '20' }]}>
                          <MaterialIcons name="check" size={14} color={colors.success} />
                        </View>
                        <View style={styles.bookingSubInfo}>
                          <Text style={[styles.bookingSubName, { color: colors.foreground }]} numberOfLines={1}>
                            {dj.fullName}
                          </Text>
                          <Text style={[styles.bookingSubDetail, { color: colors.muted }]} numberOfLines={1}>
                            {gig.venue_name || 'Venue'}
                            {gig.gig_date ? ` · ${formatDate(gig.gig_date)}` : ''}
                            {gig.start_time && gig.end_time ? ` · ${formatTime(gig.start_time)}–${formatTime(gig.end_time)}` : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
          <Divider />
          </>
          )}

          {/* Account — location is public; email + phone only for artists on your
              lineup, since a manager you haven't connected with shouldn't get their
              contact details. */}
          <Section label="Account">
            {basedInCountry ? (
              <View style={styles.contactRow}>
                <MaterialIcons name="location-on" size={18} color={colors.muted} style={styles.acctIcon} />
                <Text style={[styles.contactValue, { color: colors.foreground }]}>{basedInCountry.name}</Text>
              </View>
            ) : null}
            {isConnected ? (
              <>
              {dj.email ? (
                <Pressable style={({ pressed }) => [styles.contactRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => Linking.openURL(`mailto:${dj.email}`)}>
                  <MaterialIcons name="email" size={18} color={colors.muted} style={styles.acctIcon} />
                  <Text style={[styles.contactValue, { color: colors.foreground }]} numberOfLines={1}>{dj.email}</Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              {dj.phone ? (
                <Pressable style={({ pressed }) => [styles.contactRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => Linking.openURL(`tel:${dj.phone}`)}>
                  <MaterialIcons name="phone" size={18} color={colors.muted} style={styles.acctIcon} />
                  <Text style={[styles.contactValue, { color: colors.foreground }]} numberOfLines={1}>{dj.phone}</Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              </>
            ) : null}
          </Section>
        </View>
        </>
        )}
        </>
        ) : (
        <View style={styles.content}>
          {/* Shimmer skeletons while the artist's data loads */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { alignItems: 'flex-start', gap: 10 }]}>
              <Skeleton width={44} height={20} radius={6} color={colors.border} />
              <Skeleton width={78} height={11} radius={5} color={colors.border} />
            </View>
            <View style={[styles.statCard, { alignItems: 'flex-start', gap: 10 }]}>
              <Skeleton width={44} height={20} radius={6} color={colors.border} />
              <Skeleton width={78} height={11} radius={5} color={colors.border} />
            </View>
          </View>
          <View style={[styles.card, { gap: 10 }]}>
            <Skeleton width={36} height={11} radius={5} color={colors.border} />
            <Skeleton width={260} height={11} radius={5} color={colors.border} />
            <Skeleton width={200} height={11} radius={5} color={colors.border} />
          </View>
          <View style={[styles.card, { gap: 12 }]}>
            <Skeleton width={92} height={11} radius={5} color={colors.border} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Skeleton width={68} height={28} radius={14} color={colors.border} />
              <Skeleton width={68} height={28} radius={14} color={colors.border} />
              <Skeleton width={68} height={28} radius={14} color={colors.border} />
            </View>
          </View>
        </View>
        )}
      </ScrollView>



      {/* ── Assign Venue Sheet ────────────────────────────────────────────────── */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetArtistRow}>
              <AvatarImage uri={dj.profilePhotoUrl || undefined} avatarId={(dj as any).avatarId ?? undefined} seed={dj.id} name={dj.fullName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>{dj.fullName}</Text>
                <Text style={[styles.sheetSub, { color: colors.muted }]} numberOfLines={1}>{profile?.primaryGenre ?? 'Artist'}</Text>
              </View>
            </View>
            <ScrollView style={styles.venueScrollList} showsVerticalScrollIndicator={false}>
              {unassignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>ADD TO VENUE</Text>
                  {unassignedVenues.map((v) => (
                    <Pressable
                      key={v.id}
                      style={({ pressed }) => [
                        styles.venueRow,
                        { backgroundColor: pressed ? colors.surface : colors.background, borderColor: colors.border },
                      ]}
                      onPress={() => handleAddToVenue(v.id)}
                    >
                      <View style={[styles.venueRowIcon, { backgroundColor: colors.border + '60' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.muted} />
                      </View>
                      <View style={styles.venueRowInfo}>
                        <Text style={[styles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[styles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
                    </Pressable>
                  ))}
                </>
              )}
              {assignedVenues.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: unassignedVenues.length > 0 ? 16 : 0 }]}>ASSIGNED</Text>
                  {assignedVenues.map((v) => (
                    <View
                      key={v.id}
                      style={[styles.venueRow, { backgroundColor: colors.primary + '0A', borderColor: colors.primary + '40' }]}
                    >
                      <View style={[styles.venueRowIcon, { backgroundColor: colors.primary + '15' }]}>
                        <MaterialIcons name="location-on" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.venueRowInfo}>
                        <Text style={[styles.venueRowName, { color: colors.foreground }]}>{v.name}</Text>
                        <Text style={[styles.venueRowType, { color: colors.muted }]}>{v.venueType}</Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [styles.removeVenueBtn, { backgroundColor: colors.error + '15', opacity: pressed ? 0.6 : 1 }]}
                        onPress={() => handleRemoveFromVenue(v.id)}
                      >
                        <MaterialIcons name="remove-circle" size={16} color={colors.error} />
                        <Text style={[styles.removeVenueBtnText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              {myVenues.length === 0 && (
                <Text style={[styles.emptyVenues, { color: colors.muted }]}>No venues yet. Add a venue first.</Text>
              )}
            </ScrollView>
            <Pressable
              style={[styles.doneBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowAssignSheet(false)}
            >
              <Text style={[styles.doneBtnText, { color: colors.foreground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* ── Report Modal ───────────────────────────────────────────── */}
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        reportedType="artist"
        reportedId={artistId ?? ''}
        reportedName={dj.fullName}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  reportBtn: { padding: 4 },
  connectBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 22, paddingHorizontal: 20, gap: 4 },
  heroCard: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroPhoto: { width: 80, height: 80, borderRadius: 40 },
  heroNameBlock: { flex: 1, gap: 4 },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  djName: { fontSize: 22, fontFamily: fonts.bodyBold, textAlign: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  content: {},
  // Copied verbatim from venue-detail so the two detail screens' tab bars match.
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16, marginHorizontal: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  card: { padding: 14, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 14, lineHeight: 21 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  primaryChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '500' },
  ratesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  privateText: { fontSize: 10, fontWeight: '600' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel: { fontSize: 13 },
  rateValue: { fontSize: 15, fontWeight: '700' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  acctIcon: { width: 20, textAlign: 'center' },
  contactValue: { flex: 1, fontSize: 14, fontWeight: '500' },
  linksCol: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 0.5 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
  gigHistorySection: { paddingHorizontal: 20, paddingVertical: 16 },
  gigHistoryScroll: { height: 270 },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 16, fontWeight: '700' },
  collapseBadge: { marginLeft: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collapseBadgeText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  monthTable: {},
  bookingSubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5 },
  bookingSubLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bookingSubDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bookingSubInfo: { flex: 1 },
  bookingSubName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  bookingSubDetail: { fontSize: 12 },
  // Assign sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 0, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetArtistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetPhoto: { width: 40, height: 40, borderRadius: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  venueScrollList: { flexGrow: 0, maxHeight: 380 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  venueRowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  venueRowInfo: { flex: 1 },
  venueRowName: { fontSize: 15, fontWeight: '700' },
  venueRowType: { fontSize: 12, marginTop: 1 },
  removeVenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  removeVenueBtnText: { fontSize: 12, fontWeight: '600' },
  emptyVenues: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14, marginBottom: 44 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },
  // Invite
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  connectedBadgeText: { fontSize: 12, fontWeight: '700' },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  inviteBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sendInviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginBottom: 10 },
  sendInviteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
