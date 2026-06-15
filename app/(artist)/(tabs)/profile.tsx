import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert, Linking, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useAuthStore, useLineupStore, useNotificationStore, useBookingStore, useSlotStore, useVenueStore, resetAllStores } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { clearPushToken } from '@/lib/notifications-push';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { COUNTRIES } from '@/components/country-picker';

function formatMemberSince(createdAt?: string): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ArtistProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const artistProfiles = useLineupStore((s) => s.artistProfiles);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const updateArtistProfile = useLineupStore((s) => s.updateArtistProfile);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(currentUser?.id ?? ''));
  const signOut = useAuthStore((s) => s.signOut);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);
  const profile = currentUser?.id ? (artistProfiles[currentUser.id] ?? getArtistProfile(currentUser.id)) : undefined;
  const isHistoryHidden = profile?.isHistoryHidden ?? false;
  const toggleHistoryVisibility = useCallback(async () => {
    if (!currentUser?.id) return;
    const next = !isHistoryHidden;
    updateArtistProfile(currentUser.id, { isHistoryHidden: next });
    // Persist to Supabase so the eye-toggle survives reinstalls and propagates
    // to managers/other artists viewing this profile (the read mappings already
    // reference is_history_hidden defensively).
    const { error } = await supabase
      .from('artists')
      .update({ is_history_hidden: next })
      .eq('id', currentUser.id);
    if (error) console.warn('Failed to persist is_history_hidden:', error.message);
  }, [currentUser?.id, isHistoryHidden, updateArtistProfile]);

  // Source of truth = Supabase. Whenever the profile tab opens, pull the
  // artist's own row and refresh the local cache the screen reads from, so
  // every field they filled at signup/edit shows here — even if the local
  // store was empty (old account, app reinstall, or signed up before the
  // store was wired). The hardened updateArtistProfile MERGES, so this never
  // clobbers the local-only isHistoryHidden flag.
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('artists').select('*').eq('id', currentUser.id).maybeSingle();
      if (cancelled || !data) return;
      updateArtistProfile(currentUser.id, {
        userId: currentUser.id,
        primaryGenre: data.primary_genre ?? undefined,
        secondaryGenres: Array.isArray(data.secondary_genres) ? data.secondary_genres : [],
        instruments: Array.isArray(data.instruments) ? data.instruments : [],
        gender: data.gender ?? undefined,
        minRate: data.min_rate ?? undefined,
        basedIn: data.based_in ?? undefined,
        nationality: data.nationality ?? undefined,
        instagramUrl: data.instagram_url ?? undefined,
        soundcloudUrl: data.soundcloud_url ?? undefined,
        mixcloudUrl: data.mixcloud_url ?? undefined,
        spotifyUrl: data.spotify_url ?? undefined,
        isHistoryHidden: data.is_history_hidden ?? false,
      });
      updateProfile({
        fullName: data.full_name ?? currentUser.fullName,
        fullLegalName: data.full_legal_name ?? undefined,
        username: data.username ?? undefined,
        bio: data.bio ?? undefined,
        location: data.based_in ?? undefined,
        yearsOfExperience: data.years_of_experience ?? undefined,
        profilePhotoUrl: data.profile_photo_url ?? undefined,
      });
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Venues where the artist has at least one completed booking
  const lineupVenues = useMemo(() => {
    const completedVenueIds = new Set(
      allBookings
        .filter((b) => b.artistId === currentUser?.id && (b.isCompleted || b.status === 'completed'))
        .map((b) => b.venueId)
    );
    return allVenues.filter((v) => completedVenueIds.has(v.id));
  }, [allBookings, allVenues, currentUser?.id]);

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(currentUser?.bio ?? '');

  const clearBookings = useBookingStore((s) => s.clearBookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!currentUser?.id) return;
    setRefreshing(true);
    const { data } = await supabase.from('bookings').select('*').eq('artist_id', currentUser.id);
    if (data) {
      clearBookings();
      data.forEach((b: any) => addBooking({
        id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
        managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
        hiddenFromCalendar: b.hidden_from_calendar ?? false,
        isArtistCreated: b.is_artist_created ?? false,
        slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
        slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
        venueName: b.venue_name ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
      }));
    }
    setRefreshing(false);
  }, [currentUser?.id]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        const uid = currentUser?.id;
        if (uid) await clearPushToken(uid);
        resetAllStores(); signOut(); router.replace('/(auth)/welcome' as Href);
      } },
    ]);
  };

  const handleSaveBio = () => {
    updateProfile({ bio: editBio });
    setIsEditing(false);
  };

  // ── Gig History ──
  const completedBookings = useMemo(() => {
    return allBookings
      .filter((b) => b.artistId === currentUser?.id && (b.isCompleted || b.status === 'completed'))
      .map((b) => {
        const slot = allSlots.find((s) => s.id === b.slotId);
        const venue = allVenues.find((v) => v.id === b.venueId);
        const resolvedSlot = slot ?? (b.slotDate ? {
          id: b.slotId,
          venueId: b.venueId,
          date: b.slotDate,
          name: b.slotName ?? '',
          startTime: b.slotStartTime ?? '',
          endTime: b.slotEndTime ?? '',
          createdAt: b.createdAt,
        } : undefined);
        const resolvedVenue = venue ?? (b.venueName ? { id: b.venueId, name: b.venueName } as unknown as typeof venue : undefined);
        return { ...b, slot: resolvedSlot, venue: resolvedVenue };
      })
      .filter((b) => b.slot?.date)
      .sort((a, b) => (a.slot?.date ?? '') > (b.slot?.date ?? '') ? -1 : 1);
  }, [allBookings, allSlots, allVenues, currentUser?.id]);

  // Monthly Plays: completed bookings in last 30 days
  const monthlyPlays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return completedBookings.filter((b) => b.slot?.date && new Date(b.slot.date) >= cutoff).length;
  }, [completedBookings]);

  const basedInCountry = profile?.basedIn ? COUNTRIES.find((c) => c.name === profile.basedIn) : undefined;
  const nationalityCountry = profile?.nationality ? COUNTRIES.find((c) => c.name === profile.nationality) : undefined;

  const mediaLinks = {
    soundcloud: profile?.mediaLinks?.soundcloud ?? profile?.soundcloudUrl,
    mixcloud: profile?.mediaLinks?.mixcloud ?? profile?.mixcloudUrl,
    instagram: profile?.mediaLinks?.instagram ?? profile?.instagramUrl,
    spotify: profile?.mediaLinks?.spotify ?? profile?.spotifyUrl,
  };
  const hasLinks = Object.values(mediaLinks).some(Boolean);
  const memberSince = formatMemberSince(currentUser?.createdAt);
  const secondaryGenres = profile?.secondaryGenres ?? [];
  const instruments = profile?.instruments ?? [];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: keyboardHeight }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Profile</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={({ pressed }) => [styles.notifBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push('/(artist)/settings' as Href)}
            >
              <MaterialIcons name="settings" size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Edit icon top-right */}
          <Pressable
            style={({ pressed }) => [styles.heroEditBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.push('/(artist)/edit-profile' as Href)}
            hitSlop={8}
          >
            <MaterialIcons name="edit" size={18} color={colors.muted} />
          </Pressable>
          {/* Top row: photo + name/flag */}
          <View style={styles.profileTopRow}>
            {currentUser?.profilePhotoUrl ? (
              <View style={[styles.profilePhoto, { overflow: 'hidden' }]}>
                <Image source={{ uri: currentUser.profilePhotoUrl }} style={{ width: 80, height: 80 }} resizeMode="cover" />
              </View>
            ) : (
              <View style={[styles.profilePhoto, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                <MaterialIcons name="person" size={36} color={colors.muted} />
              </View>
            )}
            <View style={styles.profileNameBlock}>
              <Text style={[styles.name, { color: colors.foreground }]}>
                {currentUser?.fullName}{nationalityCountry ? ` ${nationalityCountry.flag}` : ''}
              </Text>
              <Text style={[styles.genre, { color: colors.muted }]}>{profile?.primaryGenre ?? 'Artist'}</Text>
              {/* Extra header fields */}
              {profile?.gender && (
                <View style={styles.metaRow}>
                  <View style={[styles.metaPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.metaPillText, { color: colors.foreground }]}>{profile.gender}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
          {/* Bottom row: based in on the left (consistent across all profile views) */}
          {basedInCountry ? (
            <View style={[styles.profileBottomRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={13} color={colors.muted} />
                <Text style={[styles.locationText, { color: colors.muted }]}>{basedInCountry.name}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Years Experience card — only if set */}
        {currentUser?.yearsOfExperience !== undefined && (
          <View style={[styles.yearsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{currentUser.yearsOfExperience}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Years Experience</Text>
          </View>
        )}

        {/* Stats — Monthly Plays + Completed Gigs */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{monthlyPlays}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Monthly Plays</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{completedBookings.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Completed Gigs</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Bio — only if filled */}
          {currentUser?.bio ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Bio</Text>
              <Text style={[styles.cardText, { color: colors.foreground }]}>{currentUser.bio}</Text>
            </View>
          ) : null}

          {/* Music Genres */}
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

          {/* Instruments */}
          {instruments.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Instruments</Text>
              <View style={styles.chipRow}>
                {instruments.map((i: string) => (
                  <View key={i} style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.foreground }]}>{i}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Rates */}
          {profile && profile.minRate !== undefined && profile.minRate !== null && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Rate (AED)</Text>
                <View style={[styles.privateBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <MaterialIcons name="lock" size={10} color={colors.muted} />
                  <Text style={[styles.privateText, { color: colors.muted }]}>Private</Text>
                </View>
              </View>
              <View style={styles.rateRow}>
                <Text style={[styles.rateLabel, { color: colors.muted }]}>Minimum</Text>
                <Text style={[styles.rateValue, { color: colors.foreground }]}>AED {profile.minRate.toLocaleString()}</Text>
              </View>
            </View>
          )}



          {/* Links */}
          {hasLinks && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Links</Text>
              <View style={styles.linksCol}>
                {mediaLinks.instagram && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(mediaLinks.instagram!)}
                  >
                    <View style={[styles.linkIcon, { backgroundColor: '#E1306C20' }]}>
                      <MaterialIcons name="camera-alt" size={18} color="#E1306C" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Instagram</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
                {mediaLinks.soundcloud && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(mediaLinks.soundcloud!)}
                  >
                    <View style={[styles.linkIcon, { backgroundColor: '#FF550020' }]}>
                      <MaterialIcons name="music-note" size={18} color="#FF5500" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>SoundCloud</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
                {mediaLinks.mixcloud && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(mediaLinks.mixcloud!)}
                  >
                    <View style={[styles.linkIcon, { backgroundColor: '#5000FF20' }]}>
                      <MaterialIcons name="cloud" size={18} color="#5000FF" />
                    </View>
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Mixcloud</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} />
                  </Pressable>
                )}
                {mediaLinks.spotify && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(mediaLinks.spotify!)}
                  >
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

          {/* History */}
          <View style={styles.gigHistorySection}>
            <View style={[styles.collapseHeader, { borderColor: colors.border }]}>
              <View style={styles.collapseHeaderLeft}>
                <MaterialIcons name="history" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <Text style={[styles.collapseTitle, { color: colors.foreground }]}>History</Text>
                <View style={[styles.collapseBadge, { backgroundColor: colors.muted + '22' }]}>
                  <Text style={[styles.collapseBadgeText, { color: colors.muted }]}>{completedBookings.length}</Text>
                </View>
                {isHistoryHidden && (
                  <View style={[styles.privateBadge, { backgroundColor: colors.background, borderColor: colors.border, marginLeft: 6 }]}>
                    <MaterialIcons name="lock" size={10} color={colors.muted} />
                    <Text style={[styles.privateText, { color: colors.muted }]}>Private</Text>
                  </View>
                )}
              </View>
              <Pressable
                onPress={toggleHistoryVisibility}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
                hitSlop={8}
              >
                <MaterialIcons
                  name={isHistoryHidden ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={isHistoryHidden ? colors.muted : colors.primary}
                />
              </Pressable>
            </View>

            {completedBookings.length === 0 ? (
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
                  {completedBookings.map((booking, idx) => (
                    <Pressable
                      key={booking.id}
                      style={({ pressed }) => [styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 }, idx === 0 && { borderTopWidth: 0 }]}
                      onPress={() => router.push(('/(artist)/booking-detail?id=' + booking.id) as Href)}
                    >
                      <View style={styles.bookingSubLeft}>
                        <View style={[styles.bookingSubDot, { backgroundColor: colors.success + '20' }]}>
                          <MaterialIcons name="check" size={14} color={colors.success} />
                        </View>
                        <View style={styles.bookingSubInfo}>
                          <Text style={[styles.bookingSubName, { color: colors.foreground }]} numberOfLines={1}>
                            {currentUser?.fullName ?? 'Artist'}
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

          {/* Account */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.muted }]}>Account</Text>
            <View style={styles.accountRow}>
              <MaterialIcons name="email" size={16} color={colors.muted} />
              <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser?.email}</Text>
            </View>
            {currentUser?.phone && (
              <View style={styles.accountRow}>
                <MaterialIcons name="phone" size={16} color={colors.muted} />
                <Text style={[styles.accountText, { color: colors.foreground }]}>{currentUser.phone}</Text>
              </View>
            )}
          </View>

          {/* Sign Out */}
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
            onPress={handleSignOut}
          >
            <MaterialIcons name="logout" size={18} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  title: { fontSize: 24, fontWeight: '800' },
  headerRight: { flexDirection: 'row', gap: 8 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  profileCard: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14, position: 'relative' },
  heroEditBtn: { position: 'absolute', top: 12, right: 12, zIndex: 1, padding: 4 },
  profileTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profilePhoto: { width: 80, height: 80, borderRadius: 16, borderWidth: 1 },
  profileNameBlock: { flex: 1, gap: 4 },
  profileBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileInfo: { flex: 1, gap: 4 },
  name: { fontSize: 22, fontWeight: '800' },
  genre: { fontSize: 15 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13 },
  nationalityFlag: { fontSize: 22, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaPill: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  metaPillText: { fontSize: 12, fontWeight: '500' },
  memberSince: { fontSize: 11, marginTop: 4 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  // Stats
  yearsCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 4, marginTop: 4 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  // Cards
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 14, lineHeight: 21 },
  subSectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  editBioContainer: { gap: 10 },
  bioInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  saveBioBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveBioBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  primaryChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '500' },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  privateText: { fontSize: 10, fontWeight: '600' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel: { fontSize: 13 },
  rateValue: { fontSize: 15, fontWeight: '700' },
  // Links
  linksCol: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountText: { fontSize: 14 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  signOutText: { fontSize: 15, fontWeight: '700' },
  editBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: 8 },
  // Gig History
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
  // Venues section
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  venueIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  venueName: { fontSize: 14, fontWeight: '600' },
  venueType: { fontSize: 12, marginTop: 1 },
  venueLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  venueLocationText: { fontSize: 11, maxWidth: 90 },
});
