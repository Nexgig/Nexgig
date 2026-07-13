import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, Linking, ActivityIndicator } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import type { Venue } from '@/lib/types';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useAuthStore, useVenueDirectoryStore, mapVenueRow, venuePhotoUri } from '@/lib/store';
import { Section, Divider, Chip } from '@/components/ui/card-free';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/fonts';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import { ReportModal } from '@/components/report-modal';

function MapsBadge({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.mapsBadge, { backgroundColor: colors.primary + '20', opacity: pressed ? 0.7 : 1 }]}
    >
      <MaterialIcons name="directions" size={15} color={colors.primary} />
      <Text style={[styles.mapsBadgeText, { color: colors.primary }]}>Maps</Text>
    </Pressable>
  );
}

export default function ArtistVenueDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const currentUser = useAuthStore((s) => s.currentUser);
  const storeVenue = useVenueStore((s) => s.getVenueById(id ?? ''));
  // Full venue cached when the artist browsed the Network venues list — lets this page
  // open complete on the first frame (no spinner, no fetch-on-open second pass).
  const dirVenue = useVenueDirectoryStore((s) => (id ? s.venues[id] : undefined));
  const [fetchedVenue, setFetchedVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const venue = storeVenue ?? dirVenue ?? fetchedVenue;
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
    if (!storeVenue && !dirVenue && id) {
      setVenueLoading(true);
      supabase.from('venues').select('*').eq('id', id).maybeSingle().then(({ data }) => {
        if (cancelled) return;
        if (data) setFetchedVenue(mapVenueRow(data));
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
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Venue Profile</Text>
          </View>
          <Pressable onPress={() => setShowReport(true)} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1, alignItems: 'flex-end' }]} hitSlop={8}>
            <MaterialIcons name="flag" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Venue Photo */}
        {venuePhotoUri(venue) && (
          <Image source={{ uri: venuePhotoUri(venue) }} style={styles.venuePhoto} resizeMode="cover" />
        )}

        {/* Venue Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoTopRow}>
            <View style={styles.infoLeft}>
              <View style={styles.nameRow}>
                <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
                {venue.verificationStatus === 'verified' && (
                  <MaterialIcons name="verified" size={16} color={colors.primary} />
                )}
              </View>
              {venue.capacity ? (
                <View style={styles.infoRow}>
                  <MaterialIcons name="people" size={16} color={colors.muted} />
                  <Text style={[styles.infoText, { color: colors.muted }]}>Capacity: {venue.capacity}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <Divider />

        {/* Tab Bar — Overview only for artists viewing any venue */}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {venue.vibeDescription ? (
              <>
                <Section label="Vibe">
                  <Text style={[styles.cardBody, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.preferredEnergy && venue.preferredEnergy.length > 0 ? (
              <>
                <Section label="Preferred Energy">
                  <View style={styles.chipRow}>
                    {venue.preferredEnergy.map((e) => <Chip key={e} label={e} />)}
                  </View>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.genrePreferences && venue.genrePreferences.length > 0 ? (
              <>
                <Section label="Genre Preferences">
                  <View style={styles.chipRow}>
                    {venue.genrePreferences.map((g) => <Chip key={g} label={g} />)}
                  </View>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.rulesTemplate ? (
              <>
                <Section label="Venue Rules">
                  <Text style={[styles.cardBody, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.audienceType && venue.audienceType.length > 0 ? (
              <>
                <Section label="Audience">
                  <View style={styles.chipRow}>
                    {venue.audienceType.map((a) => <Chip key={a} label={a} />)}
                  </View>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.subVibe && venue.subVibe.length > 0 ? (
              <>
                <Section label="Sub-Vibe">
                  <View style={styles.chipRow}>
                    {venue.subVibe.map((sv) => <Chip key={sv} label={sv} />)}
                  </View>
                </Section>
                <Divider />
              </>
            ) : null}
            {(venue.instagramUrl || venue.musicLink) && (() => {
              const links = [
                venue.instagramUrl && { key: 'instagram', label: 'Instagram', url: venue.instagramUrl },
                venue.musicLink && { key: 'music', label: 'Music', url: venue.musicLink },
              ].filter(Boolean) as { key: string; label: string; url: string }[];

              return (
                <>
                  <Section label="Links">
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
                  </Section>
                  <Divider />
                </>
              );
            })()}

            {venue.googleMapsLocation?.address ? (
              <>
                <Section label="Location">
                  <View style={styles.locationSectionRow}>
                    <MapsBadge
                      onPress={() => {
                        const loc = venue.googleMapsLocation;
                        const url = (loc?.lat && loc?.lng)
                          ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
                          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue.name || '')}`;
                        Linking.openURL(url);
                      }}
                    />
                    <Text style={[styles.locationAddress, { color: colors.foreground }]}>{venue.googleMapsLocation.address}</Text>
                  </View>
                </Section>
              </>
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
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 8,
  },
  venueType: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  infoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  infoLeft: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 18, fontFamily: fonts.bodyBold, flexShrink: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationSectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationAddress: { fontSize: 14, lineHeight: 20, flex: 1 },
  mapsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  mapsBadgeText: { fontSize: 13, fontWeight: '700' },
  infoText: { fontSize: 13, flex: 1 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 0.5, marginHorizontal: 16,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: {},
  card: { padding: 14, gap: 8 },
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
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  linkRowText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
