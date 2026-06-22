import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useLineupStore, useBookingStore, useVenueStore, useSlotStore, useArtistDirectoryStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { COUNTRIES } from '@/components/country-picker';
import { ReportModal } from '@/components/report-modal';
import { supabase } from '@/lib/supabase';

function formatMemberSince(createdAt?: string): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ArtistProfileViewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { artistId } = useLocalSearchParams<{ artistId: string }>();

  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);
  const allBookings = useBookingStore((s) => s.bookings);
  const allSlots = useSlotStore((s) => s.slots);
  const allVenues = useVenueStore((s) => s.venues);

  const djFromStore = getArtistUser(artistId ?? '');
  const profileFromStore = getArtistProfile(artistId ?? '');
  // Full data cached when the artist browsed the Network list — lets this page open
  // complete on the first frame (no spinner, no fetch-on-open second pass).
  const dirEntry = useArtistDirectoryStore((s) => (artistId ? s.entries[artistId] : undefined));

  const [fetchedUser, setFetchedUser] = useState<any>(null);
  const [fetchedProfile, setFetchedProfile] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!artistId) return;
    // Always fetch the full row from Supabase (the source of truth), even when
    // the artist is in the local store — the stored ArtistProfile doesn't carry
    // bio/years, so those would otherwise never show. Only show the spinner if
    // we have nothing to display yet.
    if (!djFromStore && !dirEntry) setIsFetching(true);
    // Read the public profile from the artists table only (world-readable to
    // authenticated users). The artists row carries name/photo/bio/based_in/years
    // plus genre/links — so we no longer read the users table here (it holds
    // private PII: email/phone/push_token, now locked to own-row).
    supabase.from('artists').select('*').eq('id', artistId).maybeSingle()
      .then(({ data: p }) => {
        if (p) {
          setFetchedUser({
            id: p.id, email: p.email ?? '', phone: '', accountType: 'artist' as const,
            fullName: p.full_name, profilePhotoUrl: p.profile_photo_url,
            bio: p.bio, location: p.based_in, yearsOfExperience: p.years_of_experience ?? undefined,
            isPhoneVerified: false, isEmailVerified: false,
            createdAt: p.created_at, updatedAt: p.updated_at,
          });
          setFetchedProfile({
            userId: p.id, primaryGenre: p.primary_genre,
            secondaryGenres: Array.isArray(p.secondary_genres) ? p.secondary_genres : [],
            instruments: Array.isArray(p.instruments) ? p.instruments : [],
            minRate: p.min_rate ?? undefined, bio: p.bio,
            yearsOfExperience: p.years_of_experience ?? undefined,
            gender: p.gender ?? undefined,
            basedIn: p.based_in, nationality: p.nationality,
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
      });
  }, [artistId]);

  // Prefer freshly-fetched Supabase data (has bio/years), then the directory cache
  // (complete, from Network browsing), then the local store.
  const dj = fetchedUser ?? dirEntry?.user ?? djFromStore;
  const profile = fetchedProfile ?? dirEntry?.profile ?? profileFromStore;

  // All completed bookings for this artist (public gig history)
  const completedBookings = useMemo(() => {
    return allBookings
      .filter((b) => b.artistId === artistId && (b.isCompleted || b.status === 'completed'))
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
  }, [allBookings, artistId, allSlots, allVenues]);

  // Monthly Plays: completed bookings in last 30 days
  const monthlyPlays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return completedBookings.filter((b) => b.slot?.date && new Date(b.slot.date) >= cutoff).length;
  }, [completedBookings]);

  if (isFetching) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!dj) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Artist not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const completedGigs = completedBookings.length;
  const last5Gigs = completedBookings.slice(0, 5);
  const memberSince = formatMemberSince(dj.createdAt);
  const basedInCountry = profile?.basedIn ? COUNTRIES.find((c) => c.name === profile.basedIn) : undefined;
  const secondaryGenres: string[] = profile?.secondaryGenres ?? [];
  const instruments: string[] = profile?.instruments ?? [];
  // bio lives on the artists row (profile), not the users row — fall back to it.
  const bio = dj.bio ?? profile?.bio;
  const mediaLinks = {
    instagram: profile?.instagramUrl ?? (profile?.mediaLinks as Record<string, string> | undefined)?.instagram,
    soundcloud: profile?.soundcloudUrl ?? (profile?.mediaLinks as Record<string, string> | undefined)?.soundcloud,
    spotify: profile?.spotifyUrl ?? (profile?.mediaLinks as Record<string, string> | undefined)?.spotify,
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Artist Profile</Text>
          <Pressable onPress={() => setShowReport(true)} style={styles.backBtn} hitSlop={8}>
            <MaterialIcons name="flag" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* 1. Profile Hero: photo, name, location, member since */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Top row: photo + name/flag */}
          <View style={styles.heroTopRow}>
            <AvatarImage uri={dj.profilePhotoUrl} name={dj.fullName} size={80} />
            <View style={styles.heroNameBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.djName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                  {dj.fullName}
                </Text>
                {profile?.hasCompletedBooking ? (
                  <MaterialIcons name="verified" size={18} color={colors.primary} />
                ) : null}
              </View>
              <Text style={[styles.djGenre, { color: colors.muted }]}>{profile?.primaryGenre ?? 'Artist'}</Text>
            </View>
          </View>
          {/* Bottom row: based in on the left (consistent across all profile views) */}
          {basedInCountry ? (
            <View style={[styles.heroBottomRow, { justifyContent: 'flex-start' }]}>
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={13} color={colors.muted} />
                <Text style={[styles.locationText, { color: colors.muted }]}>{basedInCountry.name}</Text>
              </View>
            </View>
          ) : null}
        </View>

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
          {bio ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>Bio</Text>
              <Text style={[styles.cardText, { color: colors.foreground }]}>{bio}</Text>
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

          {/* Links — moved before History to match the artist's own profile order */}
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

          {/* Last 5 completed gigs — hidden if artist set isHistoryHidden */}
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
                    <View
                      key={booking.id}
                      style={[styles.bookingSubRow, { backgroundColor: colors.background, borderTopColor: colors.border }, idx === 0 && { borderTopWidth: 0 }]}
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
                            {(booking.venue as { name?: string } | undefined)?.name ?? (booking as Record<string, unknown>).venueName as string ?? 'Unknown Venue'}
                            {booking.slot?.date ? ` · ${formatDate(booking.slot.date)}` : ''}
                            {booking.slot?.startTime && booking.slot?.endTime
                              ? ` · ${formatTime(booking.slot.startTime)}–${formatTime(booking.slot.endTime)}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
          )}
        </View>
      </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  heroCard: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroNameBlock: { flex: 1, gap: 4 },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroInfo: { flex: 1, gap: 4 },
  djName: { fontSize: 18, fontWeight: '800' },
  djGenre: { fontSize: 14 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 13 },
  memberSince: { fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  content: { padding: 20, gap: 16 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  cardLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  primaryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  primaryChipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  linksCol: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  linkIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
  gigHistorySection: { gap: 0 },
  gigHistoryScroll: { height: 270, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 0.5, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  collapseTitle: { fontSize: 15, fontWeight: '700' },
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
});
