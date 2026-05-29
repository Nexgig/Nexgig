import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, Alert, Modal, Image, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useLineupStore, useBookingStore, useVenueStore, useAuthStore, useSlotStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { COUNTRIES } from '@/components/country-picker';
import { supabase } from '@/lib/supabase';
import type { VenueAssignment } from '@/lib/types';

function formatMemberSince(createdAt?: string): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ArtistProfileViewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId } = useLocalSearchParams<{ artistId: string }>();

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

  // ── Invite state ──────────────────────────────────────────────────────────
  const [inviteStatus, setInviteStatus] = useState<'none' | 'pending'>('none');
  const [isSending, setIsSending] = useState(false);

  // Check if artist is connected or has a pending invite
  const isConnected = useMemo(
    () => globalLineup.some((r) => r.artistId === artistId && r.managerId === currentUser?.id && r.status === 'active'),
    [globalLineup, artistId, currentUser?.id]
  );

  useEffect(() => {
    if (!currentUser?.id || !artistId || isConnected) return;
    supabase
      .from('invites')
      .select('id, status')
      .eq('manager_id', currentUser.id)
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setInviteStatus('pending');
      });
  }, [currentUser?.id, artistId, isConnected]);


  const handleSendInvite = async () => {
    if (!currentUser || !artistId || !dj) return;
    Alert.alert(
      'Invite to Lineup',
      `Send ${dj.fullName} an invitation to join your lineup? They will be added to all your venues upon acceptance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Invite',
          onPress: async () => {
            setIsSending(true);
            const { data, error } = await supabase
              .from('invites')
              .insert({ manager_id: currentUser.id, artist_id: artistId, venue_ids: [], status: 'pending' })
              .select('id')
              .single();
            if (error) {
              setIsSending(false);
              Alert.alert('Error', error.message);
              return;
            }
            addNotification({
              id: `invite-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId: artistId,
              type: 'manager_invite',
              title: 'Lineup Invitation',
              body: `${currentUser.fullName ?? 'A manager'} invited you to join their lineup.`,
              isRead: false,
              relatedId: data.id,
              relatedType: 'invite',
              createdAt: new Date().toISOString(),
            });
            setIsSending(false);
            setInviteStatus('pending');
            Alert.alert('Invite Sent!', `${dj.fullName} will be notified in their app.`);
          },
        },
      ]
    );
  };

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

  const djFromStore = getArtistUser(artistId ?? '');
  const profileFromStore = getArtistProfile(artistId ?? '');

  // If artist isn't in local store (not on lineup), fetch from Supabase
  const [fetchedUser, setFetchedUser] = useState<any>(null);
  const [fetchedProfile, setFetchedProfile] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (djFromStore || !artistId) return; // already in store
    setIsFetching(true);
    Promise.all([
      supabase.from('users').select('*').eq('id', artistId).single(),
      supabase.from('artists').select('*').eq('user_id', artistId).maybeSingle(),
    ]).then(([userRes, profileRes]) => {
      if (userRes.data) {
        const u = userRes.data;
        setFetchedUser({
          id: u.id, email: u.email, phone: u.phone, accountType: u.account_type,
          fullName: u.full_name, profilePhotoUrl: u.profile_photo_url,
          bio: u.bio, location: u.location, yearsOfExperience: u.years_of_experience,
          isPhoneVerified: u.is_phone_verified ?? false, isEmailVerified: u.is_email_verified ?? false,
          createdAt: u.created_at, updatedAt: u.updated_at,
        });
      }
      if (profileRes.data) {
        const p = profileRes.data;
        setFetchedProfile({
          userId: p.user_id, primaryGenre: p.primary_genre,
          secondaryGenres: p.secondary_genres ?? [], energyTypes: p.energy_types ?? [],
          instruments: p.instruments ?? [], socialLinks: p.social_links,
          ratePerHour: p.rate_per_hour, bio: p.bio,
          basedIn: p.based_in, nationality: p.nationality,
          minRate: p.min_rate, isHistoryHidden: p.is_history_hidden ?? false,
          mediaLinks: {
            soundcloud: p.soundcloud_url, mixcloud: p.mixcloud_url,
            instagram: p.instagram_url, spotify: p.spotify_url,
          },
          createdAt: p.created_at, updatedAt: p.updated_at,
        });
      }
      setIsFetching(false);
    });
  }, [artistId, djFromStore]);

  const resolvedDj = djFromStore ?? fetchedUser;
  const resolvedProfile = profileFromStore ?? fetchedProfile;

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

  // Monthly Plays: completed bookings in last 30 days
  const monthlyPlays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return completedBookings.filter((b) => b.slot?.date && new Date(b.slot.date) >= cutoff).length;
  }, [completedBookings]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRemove = () => {
    if (!dj) return;
    const completedCount = completedBookings.length;
    const message = completedCount > 0
      ? `${dj.fullName} has ${completedCount} completed gig${completedCount > 1 ? 's' : ''} on record. Their history will be preserved. This will remove them from your lineup and all venues.`
      : `Remove ${dj.fullName} from your lineup? This will also remove them from all venues.`;
    Alert.alert('Remove from Lineup', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          removeFromGlobalLineup(artistId ?? '');
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId ?? '',
            type: 'lineup_removed',
            title: 'Removed from Lineup',
            body: `${currentUser?.fullName ?? 'A manager'} removed you from their artist lineup.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
          router.back();
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
            body: `${currentUser?.fullName ?? 'A manager'} assigned you to ${venueName}.`,
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
        text: 'Remove', style: 'destructive', onPress: () => {
          removeFromVenue(venueId, artistId ?? '');
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artistId ?? '',
            type: 'venue_removed',
            title: 'Removed from Venue',
            body: `${currentUser?.fullName ?? 'A manager'} removed you from ${venueName}.`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  if (isFetching) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </ScreenContainer>
    );
  }

  if (!resolvedDj) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Artist not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const dj = resolvedDj;
  const profile = resolvedProfile;

  const completedGigs = completedBookings.length;
  const last5Gigs = completedBookings.slice(0, 5);
  const basedInCountry = profile?.basedIn ? COUNTRIES.find((c) => c.name === profile.basedIn) : undefined;
  const nationalityCountry = profile?.nationality ? COUNTRIES.find((c) => c.name === profile.nationality) : undefined;
  const mediaLinks = profile?.mediaLinks ?? {
    soundcloud: profile?.soundcloudUrl,
    mixcloud: profile?.mixcloudUrl,
    instagram: profile?.instagramUrl,
    spotify: profile?.spotifyUrl,
  };
  const secondaryGenres: string[] = profile?.secondaryGenres ?? [];
  const instruments: string[] = profile?.instruments ?? [];
  const minRate = profile?.minRate;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Artist Profile</Text>
        </View>

        {/* 1. Profile Hero: photo, name, location, member since */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Top row: photo + name/flag */}
          <View style={styles.heroTopRow}>
            {dj.profilePhotoUrl ? (
              <Image source={{ uri: dj.profilePhotoUrl }} style={styles.heroPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.heroPhoto, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                <MaterialIcons name="person" size={36} color={colors.muted} />
              </View>
            )}
            <View style={styles.heroNameBlock}>
              <Text style={[styles.djName, { color: colors.foreground }]}>
                {dj.fullName}{nationalityCountry ? ` ${nationalityCountry.flag}` : ''}
              </Text>
              <Text style={[styles.djGenre, { color: colors.muted }]}>{profile?.primaryGenre ?? 'Artist'}</Text>
            </View>
          </View>
          {/* Bottom row: based in + invite button (if not connected) */}
          <View style={[styles.heroBottomRow, { justifyContent: basedInCountry ? 'space-between' : 'flex-end' }]}>
            {basedInCountry && (
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={13} color={colors.muted} />
                <Text style={[styles.locationText, { color: colors.muted }]}>{basedInCountry.name}</Text>
              </View>
            )}
            {!isConnected && (
              inviteStatus === 'pending' ? (
                <View style={[styles.connectedBadge, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                  <MaterialIcons name="schedule" size={13} color="#F59E0B" />
                  <Text style={[styles.connectedBadgeText, { color: '#F59E0B' }]}>Invite Sent</Text>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.inviteBtn, { backgroundColor: colors.primary, opacity: (pressed || isSending) ? 0.85 : 1 }]}
                  onPress={handleSendInvite}
                  disabled={isSending}
                >
                  <MaterialIcons name="person-add" size={14} color="#fff" />
                  <Text style={styles.inviteBtnText}>{isSending ? 'Sending…' : 'Invite to Lineup'}</Text>
                </Pressable>
              )
            )}
          </View>
        </View>

        {/* Years Experience card — only if set */}
        {dj.yearsOfExperience !== undefined && (
          <View style={[styles.yearsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{dj.yearsOfExperience}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Years Experience</Text>
          </View>
        )}

        {/* 2. Stats: Monthly Plays + Completed Gigs */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{monthlyPlays}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Monthly Plays</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{completedGigs}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Completed Gigs</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* 3. Bio — only if filled */}
          {dj.bio ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Bio</Text>
              <Text style={[styles.cardText, { color: colors.foreground }]}>{dj.bio}</Text>
            </View>
          ) : null}

          {/* 4. Music Genres */}
          {profile && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Music Genres</Text>
              <View style={styles.chipRow}>
                <View style={[styles.primaryChip, { backgroundColor: colors.primary }]}>
                  <Text style={styles.primaryChipText}>{profile.primaryGenre}</Text>
                </View>
                {secondaryGenres.map((g) => (
                  <View key={g} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.foreground }]}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 5. Instruments */}
          {instruments.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Instruments</Text>
              <View style={styles.chipRow}>
                {instruments.map((i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.foreground }]}>{i}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 6. Last 5 completed gigs — hidden if artist set isHistoryHidden */}
          {!profile?.isHistoryHidden && (
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
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="history" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No completed gigs yet</Text>
              </View>
            ) : (
              <ScrollView
                style={[styles.gigHistoryScroll, { borderColor: colors.border }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <View style={[styles.monthTable, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {last5Gigs.map((booking, idx) => (
                    <Pressable
                      key={booking.id}
                      style={({ pressed }) => [styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }, idx === 0 && { borderTopWidth: 0 }]}
                      onPress={() => router.push(('/(manager)/booking-detail?id=' + booking.id) as Href)}
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
                            {booking.venue?.name ?? booking.venueName ?? 'Unknown Venue'}
                            {booking.slot?.date ? ` · ${formatDate(booking.slot.date)}` : ''}
                            {booking.slot?.startTime && booking.slot?.endTime
                              ? ` · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
          )}

          {/* 7. Links — only show filled ones */}
          {(mediaLinks.instagram || mediaLinks.soundcloud || mediaLinks.spotify) && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Links</Text>
              <View style={styles.linksCol}>
                {mediaLinks.instagram && (
                  <Pressable style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]} onPress={() => Linking.openURL(mediaLinks.instagram!)}>
                    <View style={[styles.linkIcon, { backgroundColor: '#E1306C20' }]}>
                      <MaterialIcons name="camera-alt" size={18} color="#E1306C" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Instagram</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
                {mediaLinks.soundcloud && (
                  <Pressable style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]} onPress={() => Linking.openURL(mediaLinks.soundcloud!)}>
                    <View style={[styles.linkIcon, { backgroundColor: '#FF550020' }]}>
                      <MaterialIcons name="music-note" size={18} color="#FF5500" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>SoundCloud</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
                {mediaLinks.spotify && (
                  <Pressable style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]} onPress={() => Linking.openURL(mediaLinks.spotify!)}>
                    <View style={[styles.linkIcon, { backgroundColor: '#1DB95420' }]}>
                      <MaterialIcons name="headset" size={18} color="#1DB954" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Spotify</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Rates — manager-only private section */}
          {minRate !== undefined && minRate !== null && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.ratesHeader}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Rate (AED)</Text>
                <View style={[styles.privateBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <MaterialIcons name="lock" size={10} color={colors.muted} />
                  <Text style={[styles.privateText, { color: colors.muted }]}>Private</Text>
                </View>
              </View>
              <View style={styles.rateRow}>
                <Text style={[styles.rateLabel, { color: colors.muted }]}>Minimum</Text>
                <Text style={[styles.rateValue, { color: colors.foreground }]}>AED {minRate.toLocaleString()}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>



      {/* ── Assign Venue Sheet ────────────────────────────────────────────────── */}
      <Modal visible={showAssignSheet} transparent animationType="slide" onRequestClose={() => setShowAssignSheet(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetArtistRow}>
              {dj.profilePhotoUrl ? (
                <Image source={{ uri: dj.profilePhotoUrl }} style={styles.sheetPhoto} resizeMode="cover" />
              ) : (
                <View style={[styles.sheetPhoto, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                  <MaterialIcons name="person" size={18} color={colors.muted} />
                </View>
              )}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  heroCard: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroPhoto: { width: 80, height: 80, borderRadius: 16 },
  heroNameBlock: { flex: 1, gap: 4 },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  djName: { fontSize: 22, fontWeight: '800' },
  djGenre: { fontSize: 15 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13 },
  yearsCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
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
  linksCol: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
  gigHistorySection: { gap: 0 },
  gigHistoryScroll: { height: 270, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapseTitle: { fontSize: 16, fontWeight: '700' },
  collapseBadge: { marginLeft: 8, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collapseBadgeText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  monthTable: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
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
  sheetPhoto: { width: 40, height: 40, borderRadius: 10 },
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
