import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import type { Venue } from '@/lib/types';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useAuthStore, useNotificationStore, useVenueDirectoryStore, mapVenueRow, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { cityFromAddress } from '@/lib/places';
import { ReportModal } from '@/components/report-modal';
import { supabase } from '@/lib/supabase';

export default function VenueDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const currentUser = useAuthStore((s) => s.currentUser);
  const storeVenue = useVenueStore((s) => s.getVenueById(id ?? ''));
  // Full venue cached when this venue was browsed in a list — lets this page open
  // complete on the first frame (no spinner, no fetch-on-open second pass).
  const dirVenue = useVenueDirectoryStore((s) => (id ? s.venues[id] : undefined));
  const [fetchedVenue, setFetchedVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const venue = storeVenue ?? dirVenue ?? fetchedVenue;
  const hideVenue = useVenueStore((s) => s.hideVenue);
  const unhideVenue = useVenueStore((s) => s.unhideVenue);
  const isOwner = venue?.managerId === currentUser?.id;
  const getSlotsByVenue = useSlotStore((s) => s.getSlotsByVenue);
  const getBookingBySlot = useBookingStore((s) => s.getBookingBySlot);
  // Subscribe to raw array for immediate reactivity on add/remove
  const allVenueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);

  const [activeTab, setActiveTab] = useState<'overview' | 'slots' | 'lineup'>('overview');
  const [showReport, setShowReport] = useState(false);

  const slots = useMemo(() => venue ? getSlotsByVenue(venue.id) : [], [venue, getSlotsByVenue]);
  const venueAssignments = useMemo(
    () => venue ? allVenueAssignments.filter((a) => a.venueId === venue.id && a.status === 'active') : [],
    [venue, allVenueAssignments]
  );

  // Fallback: if the venue isn't in the local store (e.g. another manager's venue
  // opened from Network/Discovery), fetch it read-only from Supabase by id.
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
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Venue</Text>
            <View style={{ width: 32 }} />
          </View>
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

  const handleToggleHideVenue = () => {
    if (venue.isHidden) {
      Alert.alert(
        'Unhide Venue',
        `Are you sure you want to unhide "${venue.name}"? It will appear in your Venues tab again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unhide', onPress: async () => {
            unhideVenue(venue.id);
            await supabase.from('venues').update({ is_hidden: false }).eq('id', venue.id);
          }},
        ]
      );
    } else {
      Alert.alert(
        'Hide Venue',
        'This venue will be hidden from your active list. You can unhide it from your Profile tab.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Hide', style: 'destructive', onPress: async () => {
            hideVenue(venue.id);
            await supabase.from('venues').update({ is_hidden: true }).eq('id', venue.id);
            router.back();
          }},
        ]
      );
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={[styles.title, { color: colors.foreground, flex: 0, flexShrink: 1 }]} numberOfLines={1}>{venue.name}</Text>
            {venue.verificationStatus === 'verified' && (
              <MaterialIcons name="verified" size={16} color={colors.primary} />
            )}
          </View>
          {isOwner ? (
            <Pressable onPress={() => router.push(('/(manager)/edit-venue?id=' + venue.id) as Href)} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <MaterialIcons name="edit" size={22} color={colors.foreground} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setShowReport(true)} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]} hitSlop={8}>
              <MaterialIcons name="flag" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Venue Photo — manager's upload, else admin-curated fallback */}
        {venuePhotoUri(venue) && (
          <Image source={{ uri: venuePhotoUri(venue) }} style={styles.venuePhoto} />
        )}

        {/* Venue Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.venueType, { color: colors.muted }]}>{venue.venueType}</Text>
            <StatusBadge status={venue.isHidden ? 'hidden' : 'active'} />
          </View>
          {isOwner && venue.verificationStatus !== 'verified' && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {venue.verificationStatus === 'rejected' ? (
                <View style={[styles.verifyPill, { backgroundColor: colors.error + '15' }]}>
                  <MaterialIcons name="cancel" size={13} color={colors.error} />
                  <Text style={[styles.verifyPillText, { color: colors.error }]}>Not approved</Text>
                </View>
              ) : (
                <View style={[styles.verifyPill, { backgroundColor: colors.warning + '15' }]}>
                  <MaterialIcons name="schedule" size={13} color={colors.warning} />
                  <Text style={[styles.verifyPillText, { color: colors.warning }]}>Pending verification</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.locationRow}>
            <MaterialIcons name="location-on" size={16} color={colors.muted} />
            <Text style={[styles.locationText, { color: colors.muted }]}>{cityFromAddress(venue.googleMapsLocation?.address)}</Text>
          </View>
          {venue.capacity && (
            <View style={styles.locationRow}>
              <MaterialIcons name="people" size={16} color={colors.muted} />
              <Text style={[styles.locationText, { color: colors.muted }]}>Capacity: {venue.capacity}</Text>
            </View>
          )}
        </View>

        {/* Tab Bar — Slots and Lineup only visible to the venue owner */}
        {isOwner && (
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['overview', 'slots', 'lineup'] as const).map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                  {tab === 'overview' ? 'Overview' : tab === 'slots' ? 'Slots' : 'Lineup'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {venue.vibeDescription && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Vibe</Text>
                <Text style={[styles.cardBody, { color: colors.muted }]}>{venue.vibeDescription}</Text>
              </View>
            )}
            {venue.preferredEnergy.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Preferred Energy</Text>
                <View style={styles.chipRow}>
                  {(venue.preferredEnergy ?? []).map((e) => (
                    <View key={e} style={[styles.chip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                       <Text style={[styles.chipText, { color: colors.muted }]}>{e}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {(venue.genrePreferences.length > 0 || (venue.subVibe && venue.subVibe.length > 0)) && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Genre Preferences</Text>
                <View style={styles.chipRow}>
                  {venue.genrePreferences.map((g) => (
                    <View key={g} style={[styles.chip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                       <Text style={[styles.chipText, { color: colors.muted }]}>{g}</Text>
                    </View>
                  ))}
                  {(venue.subVibe ?? []).map((sv) => (
                    <View key={sv} style={[styles.chip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                     <Text style={[styles.chipText, { color: colors.muted }]}>{sv}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {venue.audienceType && venue.audienceType.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Audience</Text>
                <View style={styles.chipRow}>
                  {venue.audienceType.map((a) => (
                    <View key={a} style={[styles.chip, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                       <Text style={[styles.chipText, { color: colors.muted }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {venue.rulesTemplate && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Venue Rules</Text>
                <Text style={[styles.cardBody, { color: colors.muted }]}>{venue.rulesTemplate}</Text>
              </View>
            )}
            {(venue.instagramUrl || venue.musicLink) && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Links</Text>
                {venue.instagramUrl && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => {
  const url = venue.instagramUrl!.startsWith('http') ? venue.instagramUrl! : `https://www.instagram.com/${venue.instagramUrl}`;
Linking.openURL(url);
}}
                  >
                    <MaterialIcons name="camera-alt" size={20} color="#E1306C" />
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Instagram</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                  </Pressable>
                )}
                {venue.musicLink && (
                  <Pressable
                    style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => {
  const url = venue.musicLink!.startsWith('http') ? venue.musicLink! : `https://${venue.musicLink}`;
  Linking.openURL(url);
}}
                  >
                    <MaterialIcons name="music-note" size={20} color="#1DB954" />
                    <Text style={[styles.linkRowText, { color: colors.foreground }]}>Music</Text>
                    <MaterialIcons name="open-in-new" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                  </Pressable>
                )}
              </View>
            )}
            {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.greyBtn, { opacity: pressed ? 0.7 : 1, borderColor: colors.border }]}
              onPress={handleToggleHideVenue}
            >
              <MaterialIcons name={venue.isHidden ? 'visibility' : 'visibility-off'} size={18} color={colors.muted} />
              <Text style={[styles.greyBtnText, { color: colors.muted }]}>{venue.isHidden ? 'Unhide Venue' : 'Hide Venue'}</Text>
            </Pressable>
            )}
          </View>
        )}

        {/* Slots Tab — owner only */}
        {isOwner && activeTab === 'slots' && (
          <View style={styles.tabContent}>
            <Pressable
              style={({ pressed }) => [styles.greyBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/(tabs)/calendar') as Href)}
            >
              <MaterialIcons name="calendar-today" size={18} color={colors.muted} />
              <Text style={[styles.greyBtnText, { color: colors.muted }]}>Manage in Calendar</Text>
            </Pressable>
            {slots.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="event" size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 14 }}>No slots created yet</Text>
              </View>
            ) : (
              slots.sort((a, b) => a.date < b.date ? -1 : 1).map((slot) => {
                const booking = getBookingBySlot(slot.id);
                const dj = booking ? getArtistUser(booking.artistId) : undefined;
                return (
                  <Pressable
                    key={slot.id}
                    style={({ pressed }) => [styles.slotCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                    onPress={() => {
                      if (booking) {
                        router.push(('/(manager)/booking-detail?id=' + booking.id) as Href);
                      } else {
                        router.push(('/(manager)/assign-artist?slotId=' + slot.id) as Href);
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.slotName, { color: colors.foreground }]}>{slot.name}</Text>
                      <Text style={[styles.slotTime, { color: colors.muted }]}>
                        {formatDate(slot.date)} · {formatTime(slot.startTime)}–{formatTime(slot.endTime)}
                      </Text>
                      {dj && <Text style={[styles.slotDJ, { color: colors.primary }]}>{dj.fullName}</Text>}
                    </View>
                    {booking ? (
                      <StatusBadge status={booking.status} />
                    ) : (
                      <Text style={[styles.unassigned, { color: colors.warning }]}>Unassigned</Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {/* Lineup Tab — owner only */}
        {isOwner && activeTab === 'lineup' && (
          <View style={styles.tabContent}>
            {/* Add Artist button */}
            <Pressable
              style={({ pressed }) => [styles.greyBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(('/(manager)/assign-artist?venueId=' + venue.id) as Href)}
            >
              <MaterialIcons name="person-add" size={18} color={colors.muted} />
              <Text style={[styles.greyBtnText, { color: colors.muted }]}>Add Artist</Text>
            </Pressable>
            {venueAssignments.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="group" size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 14 }}>No artists assigned to this venue</Text>
              </View>
            ) : (
              [...venueAssignments]
                .sort((a, b) => {
                  const nameA = (getArtistUser(a.artistId)?.fullName ?? '').toLowerCase();
                  const nameB = (getArtistUser(b.artistId)?.fullName ?? '').toLowerCase();
                  return nameA.localeCompare(nameB);
                })
                .map((a) => {
                const dj = getArtistUser(a.artistId);
                if (!dj) return null;
                return (
                  <View
                    key={a.id}
                    style={[styles.djCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Pressable
                      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + a.artistId) as Href)}
                    >
                      <AvatarImage uri={dj.profilePhotoUrl} name={dj.fullName} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.djName, { color: colors.foreground }]}>{dj.fullName}</Text>
                        <Text style={[styles.djLocation, { color: colors.muted }]}>{dj.location ?? 'Unknown'}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.7 : 1 }]}
                      onPress={() => {
                        Alert.alert(
                          'Remove from Lineup',
                          `Remove ${dj.fullName} from this venue's lineup?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: async () => {
                              // Update local store
                              useLineupStore.getState().removeFromVenue(a.venueId, a.artistId);
                              // Update Supabase so artist sees the change on next load
                              const { error: vaErr } = await supabase.from('venue_assignments')
                                .delete()
                                .eq('venue_id', a.venueId)
                                .eq('artist_id', a.artistId);
                              if (vaErr) console.warn('venue_assignments remove error:', vaErr.message);
                              // Notify the artist
                              useNotificationStore.getState().addNotification({
                                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                userId: a.artistId,
                                type: 'venue_removed',
                                title: 'Removed from Venue',
                                body: `${venue.name}`,
                                isRead: false,
                                relatedId: a.venueId,
                                relatedType: 'venue',
                                createdAt: new Date().toISOString(),
                              });
                            }},
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="person-remove" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                );
              })
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
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' },
  venuePhoto: { width: '100%', height: 180, borderRadius: 16, marginBottom: 16 },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  venueType: { fontSize: 13, fontWeight: '500' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 13 },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  verifyPillText: { fontSize: 11, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  chipText: { fontSize: 12, fontWeight: '600' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EF4444', marginTop: 8 },
  dangerBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  greyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  greyBtnText: { fontSize: 14, fontWeight: '600' },
  addLineupCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  addLineupText: { fontSize: 15, fontWeight: '700' },
  removeBtn: { padding: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  slotCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 14 },
  slotName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  slotTime: { fontSize: 12 },
  slotDJ: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  unassigned: { fontSize: 12, fontWeight: '600' },
  djCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  djName: { fontSize: 15, fontWeight: '700' },
  djLocation: { fontSize: 13 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  linkRowText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
