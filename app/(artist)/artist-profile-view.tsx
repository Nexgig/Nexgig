import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, ActivityIndicator } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Section, Divider, StatRow, Chip } from '@/components/ui/card-free';
import { useLineupStore, useBookingStore, useVenueStore, useSlotStore, useArtistDirectoryStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { performerLabel } from '@/lib/utils';
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
  const [publicGigs, setPublicGigs] = useState<{ venue_name: string; gig_date: string; start_time: string; end_time: string }[]>([]);

  useEffect(() => {
    if (!artistId) return;
    // Always fetch the full row from Supabase (the source of truth), even when
    // the artist is in the local store — the stored ArtistProfile doesn't carry
    // bio/years, so those would otherwise never show. Only show the spinner if
    // we have nothing to display yet.
    if (!djFromStore && !dirEntry) setIsFetching(true);
    // Public gig history (venue + date + times only) via a SECURITY DEFINER RPC,
    // so we can show this artist's real completed gigs without exposing private booking fields.
    supabase.rpc('get_artist_public_gigs', { p_artist_id: artistId })
      .then(({ data }) => { if (Array.isArray(data)) setPublicGigs(data as any); });
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
            avatarId: p.avatar_id ?? undefined,
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

  // Monthly Plays: completed gigs in the last 30 days (from the public RPC).
  const monthlyPlays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return publicGigs.filter((g) => g.gig_date && new Date(g.gig_date) >= cutoff).length;
  }, [publicGigs]);

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

  const completedGigs = publicGigs.length;
  const last5Gigs = publicGigs.slice(0, 5);
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
        <View style={styles.hero}>
          <AvatarImage uri={dj.profilePhotoUrl || undefined} avatarId={(dj as any).avatarId ?? undefined} seed={dj.id} name={dj.fullName} size={80} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Text style={[styles.djName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
              {dj.fullName}
            </Text>
            {profile?.hasCompletedBooking ? (
              <MaterialIcons name="verified" size={18} color={colors.primary} />
            ) : null}
          </View>
          <Text style={[styles.djGenre, { color: colors.muted }]}>{performerLabel(profile?.instruments)}</Text>
          {basedInCountry ? (
            <View style={styles.locationRow}>
              <MaterialIcons name="location-on" size={13} color={colors.muted} />
              <Text style={[styles.locationText, { color: colors.muted }]}>{basedInCountry.name}</Text>
            </View>
          ) : null}
        </View>

        <Divider />

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
          {bio ? (
            <>
              <Section label="Bio">
                <Text style={[styles.cardText, { color: colors.foreground }]}>{bio}</Text>
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

          {/* Links — text-only rows, no trailing separator on the last */}
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
                            borderBottomWidth: i === links.length - 1 ? 0 : StyleSheet.hairlineWidth * 2,
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
                <Divider />
              </>
            );
          })()}

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
              <View style={styles.emptyCard}>
                <MaterialIcons name="history" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No completed gigs yet</Text>
              </View>
            ) : (
              <ScrollView
                style={[styles.gigHistoryScroll, { borderColor: colors.border }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.monthTable}>
                  {last5Gigs.map((gig, idx) => (
                    <View
                      key={idx}
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
  hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 22, paddingHorizontal: 20, gap: 4 },
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
  content: {},
  card: { padding: 16, gap: 10 },
  cardLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  primaryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  primaryChipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  linksCol: { gap: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 0.5 },
  linkIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
  gigHistorySection: { paddingHorizontal: 20, paddingVertical: 16 },
  gigHistoryScroll: { height: 270 },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 0.5, marginBottom: 12 },
  collapseHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  collapseTitle: { fontSize: 15, fontWeight: '700' },
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
});
