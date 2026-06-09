import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import type { Venue } from '@/lib/types';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { ReportModal } from '@/components/report-modal';

export default function ArtistVenueDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const currentUser = useAuthStore((s) => s.currentUser);
  const storeVenue = useVenueStore((s) => s.getVenueById(id ?? ''));
  const [fetchedVenue, setFetchedVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const venue = storeVenue ?? fetchedVenue;
  const getSlotsByVenue = useSlotStore((s) => s.getSlotsByVenue);
  const getBookingBySlot = useBookingStore((s) => s.getBookingBySlot);
  const getAssignmentsByVenue = useLineupStore((s) => s.getAssignmentsByVenue);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);

  const [activeTab, setActiveTab] = useState<'overview' | 'slots' | 'lineup'>('overview');
  const [showReport, setShowReport] = useState(false);

  const slots = useMemo(() => venue ? getSlotsByVenue(venue.id) : [], [venue, getSlotsByVenue]);
  const venueAssignments = useMemo(() => venue ? getAssignmentsByVenue(venue.id) : [], [venue, getAssignmentsByVenue]);

  // Only show slots that are either unbooked or booked by this artist
  const visibleSlots = useMemo(() => {
    return slots
      .filter((slot) => {
        const booking = getBookingBySlot(slot.id);
        return !booking || booking.artistId === currentUser?.id;
      })
      .sort((a, b) => a.date < b.date ? -1 : 1);
  }, [slots, getBookingBySlot, currentUser?.id]);

  // Fallback: if the venue isn't in the local store (e.g. a venue opened from
  // Network/Discovery that this artist isn't assigned to), fetch it read-only.
  useEffect(() => {
    let cancelled = false;
    if (!storeVenue && id) {
      setVenueLoading(true);
      supabase.from('venues').select('*').eq('id', id).maybeSingle().then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setFetchedVenue({
            id: data.id,
            managerId: data.manager_id,
            name: data.name,
            venueType: data.venue_type,
            photoUrls: Array.isArray(data.photo_urls) ? data.photo_urls : [],
            googleMapsLocation: data.google_maps_location ?? { address: data.address ?? '', lat: data.lat ?? 0, lng: data.lng ?? 0 },
            capacity: data.capacity ?? undefined,
            vibeDescription: data.vibe_description ?? undefined,
            preferredEnergy: Array.isArray(data.preferred_energy) ? data.preferred_energy : [],
            genrePreferences: Array.isArray(data.genre_preferences) ? data.genre_preferences : [],
            audienceType: Array.isArray(data.audience_type) ? data.audience_type : [],
            subVibe: Array.isArray(data.sub_vibe) ? data.sub_vibe : [],
            rulesTemplate: data.rules_template ?? undefined,
            instagramUrl: data.instagram_url ?? undefined,
            musicLink: data.music_link ?? undefined,
            color: data.color ?? '#2563EB',
            isHidden: data.is_hidden ?? false,
            isComplete: data.is_complete ?? true,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          } as Venue);
        }
        setVenueLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [storeVenue, id]);

  if (!venue) {
    return (
      <ScreenContainer>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Venue</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          {venueLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              <MaterialIcons name="location-off" size={48} color={colors.muted} />
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700' }}>Venue not found</Text>
              <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>This venue may have been removed or hidden.</Text>
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const venueTypeLabel = venue.venueType
    ? venue.venueType.charAt(0).toUpperCase() + venue.venueType.slice(1).replace(/_/g, ' ')
    : 'Venue';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
          <Pressable onPress={() => setShowReport(true)} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1, alignItems: 'flex-end' }]} hitSlop={8}>
            <MaterialIcons name="flag" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Venue Photo */}
        {venue.photoUrls && venue.photoUrls.length > 0 && (
          <Image source={{ uri: venue.photoUrls[0] }} style={styles.venuePhoto} resizeMode="cover" />
        )}

        {/* Venue Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.venueType, { color: colors.muted }]}>{venueTypeLabel}</Text>
          {venue.googleMapsLocation?.address ? (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={16} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>{venue.googleMapsLocation.address}</Text>
            </View>
          ) : null}
          {venue.capacity ? (
            <View style={styles.infoRow}>
              <MaterialIcons name="people" size={16} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>Capacity: {venue.capacity}</Text>
            </View>
          ) : null}
        </View>

        {/* Tab Bar — Overview only for artists viewing any venue */}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {venue.vibeDescription ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Vibe</Text>
                <Text style={[styles.cardBody, { color: colors.muted }]}>{venue.vibeDescription}</Text>
              </View>
            ) : null}
            {venue.preferredEnergy && venue.preferredEnergy.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Preferred Energy</Text>
                <View style={styles.chipRow}>
                  {venue.preferredEnergy.map((e) => (
                    <View key={e} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{e}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {venue.genrePreferences && venue.genrePreferences.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Genre Preferences</Text>
                <View style={styles.chipRow}>
                  {venue.genrePreferences.map((g) => (
                    <View key={g} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{g}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {venue.rulesTemplate ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Venue Rules</Text>
                <Text style={[styles.cardBody, { color: colors.muted }]}>{venue.rulesTemplate}</Text>
              </View>
            ) : null}
            {venue.audienceType && venue.audienceType.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Audience</Text>
                <View style={styles.chipRow}>
                  {venue.audienceType.map((a) => (
                    <View key={a} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {venue.subVibe && venue.subVibe.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Sub-Vibe</Text>
                <View style={styles.chipRow}>
                  {venue.subVibe.map((sv) => (
                    <View key={sv} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{sv}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {(venue.instagramUrl || venue.musicLink) ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Links</Text>
                {venue.instagramUrl ? (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(venue.instagramUrl!)}
                  >
                    <MaterialIcons name="camera-alt" size={20} color="#E1306C" />
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Instagram</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                  </Pressable>
                ) : null}
                {venue.musicLink ? (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => Linking.openURL(venue.musicLink!)}
                  >
                    <MaterialIcons name="music-note" size={20} color="#1DB954" />
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Music</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {!venue.vibeDescription && !venue.rulesTemplate && (!venue.preferredEnergy || venue.preferredEnergy.length === 0) && (!venue.genrePreferences || venue.genrePreferences.length === 0) && (!venue.audienceType || venue.audienceType.length === 0) && (!venue.subVibe || venue.subVibe.length === 0) && !venue.instagramUrl && !venue.musicLink && (
              <View style={styles.emptyWrap}>
                <MaterialIcons name="info-outline" size={40} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>No additional info available</Text>
              </View>
            )}
          </View>
        )}


      </ScrollView>
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        reportedType="venue"
        reportedId={venue.id}
        reportedName={venue.name}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  venuePhoto: { width: '100%', height: 200 },
  infoCard: {
    margin: 16, marginBottom: 0, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8,
  },
  venueType: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, flex: 1 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 0.5, marginHorizontal: 16,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 13 },
  slotCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  slotName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  slotTime: { fontSize: 13 },
  lineupCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 14,
  },
  artistName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  artistGenre: { fontSize: 13 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  linkRowText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
