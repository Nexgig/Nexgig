import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Linking, ActivityIndicator } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import type { Venue } from '@/lib/types';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useAuthStore, useNotificationStore, useVenueDirectoryStore, mapVenueRow, venuePhotoUri } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { syncBookingStatus } from '@/lib/booking-sync';
import { cityFromAddress } from '@/lib/places';
import { ReportModal } from '@/components/report-modal';
import { supabase } from '@/lib/supabase';
import { performerLabel } from '@/lib/utils';
import { fonts } from '@/lib/fonts';
import { Section, Divider, Chip } from '@/components/ui/card-free';

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
  const getSlotById = useSlotStore((s) => s.getSlotById);
  const getBookingBySlot = useBookingStore((s) => s.getBookingBySlot);
  const bookings = useBookingStore((s) => s.bookings);
  const updateBookingStatus = useBookingStore((s) => s.updateBookingStatus);
  const addNotification = useNotificationStore((s) => s.addNotification);
  // Subscribe to raw array for immediate reactivity on add/remove
  const allVenueAssignments = useLineupStore((s) => s.venueAssignments);
  const getArtistUser = useLineupStore((s) => s.getArtistUser);
  const getArtistProfile = useLineupStore((s) => s.getArtistProfile);

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

  // ── Delete Venue ──────────────────────────────────────────────────────────
  // Moved here from edit-venue's Danger Zone. Cancels active bookings + notifies
  // affected artists, then soft-hides the venue (is_hidden=true) so completed-gig
  // history keeps resolving the real venue name. Behaviour is identical to the old
  // edit-venue handler — only the button's location changed.
  const handleDelete = () => {
    const activeBookings = bookings.filter(
      (b) =>
        b.venueId === venue.id &&
        (b.status === 'requested' || b.status === 'past_confirmation' || b.status === 'confirmed')
    );
    const n = activeBookings.length;
    const cancelNotice =
      n > 0
        ? `\n\n${n} pending/confirmed booking${n > 1 ? 's' : ''} will be cancelled and the affected artist${n > 1 ? 's' : ''} notified.`
        : '';
    Alert.alert(
      'Delete Venue',
      `Delete "${venue.name}"? It'll be removed from your venues and the network.${cancelNotice} Completed gigs stay in your history. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const nowIso = new Date().toISOString();
            for (const booking of activeBookings) {
              const slot = getSlotById(booking.slotId);
              const isRequested = booking.status === 'requested' || booking.status === 'past_confirmation';
              const snapDate = booking.slotDate ?? slot?.date;
              updateBookingStatus(booking.id, 'cancelled', {
                cancelledAt: nowIso,
                slotDate: snapDate,
                slotName: booking.slotName ?? slot?.name,
                slotStartTime: booking.slotStartTime ?? slot?.startTime,
                slotEndTime: booking.slotEndTime ?? slot?.endTime,
                venueName: booking.venueName ?? venue.name,
                ...(isRequested ? { cancelledAsRequest: true, cancellationAcknowledged: true } : {}),
              });
              syncBookingStatus(booking.id, 'cancelled', {
                cancelledAt: nowIso,
                ...(isRequested ? { cancelledAsRequest: true, cancellationAcknowledged: true } : {}),
              });
              addNotification({
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                userId: booking.artistId,
                type: isRequested ? 'booking_request_cancelled' : 'booking_cancelled',
                title: isRequested ? 'Request Cancelled' : 'Booking Cancelled',
                body: `${booking.venueName ?? venue.name} — ${snapDate ? formatDate(snapDate) : ''}`,
                isRead: false,
                relatedId: booking.id,
                relatedType: 'booking',
                createdAt: nowIso,
              });
            }
            // Soft-hide rather than hard delete — keeps the row + slots alive so
            // completed gigs keep resolving the real venue name everywhere.
            hideVenue(venue.id);
            await supabase.from('venue_assignments').delete().eq('venue_id', venue.id);
            await supabase.from('venues').update({ is_hidden: true }).eq('id', venue.id);
            router.replace('/(manager)/(tabs)/profile' as any);
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Venue Profile</Text>
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
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <View style={styles.nameRow}>
                <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
                {venue.verificationStatus === 'verified' && (
                  <MaterialIcons name="verified" size={16} color={colors.primary} />
                )}
              </View>
              {venue.capacity ? (
                <View style={styles.locationRow}>
                  <MaterialIcons name="people" size={16} color={colors.muted} />
                  <Text style={[styles.locationText, { color: colors.muted }]}>Capacity: {venue.capacity}</Text>
                </View>
              ) : null}
            </View>
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
        </View>

        {/* Only when there's no tab bar — otherwise the tab bar's own underline
            already separates the info block from the content. */}
        {!isOwner && <Divider />}

        {/* Tab Bar — Slots and Lineup only visible to the venue owner */}
        {isOwner && (
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['overview', 'slots', 'lineup'] as const).map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                  {tab === 'overview' ? 'Overview' : tab === 'slots' ? 'Sets' : 'Lineup'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={styles.overviewTab}>
            {venue.vibeDescription ? (
              <>
                <Section label="Vibe">
                  <Text style={[styles.cardBody, { color: colors.foreground }]}>{venue.vibeDescription}</Text>
                </Section>
                <Divider />
              </>
            ) : null}
            {venue.preferredEnergy.length > 0 ? (
              <>
                <Section label="Preferred Energy">
                  <View style={styles.chipRow}>
                    {(venue.preferredEnergy ?? []).map((e) => <Chip key={e} label={e} />)}
                  </View>
                </Section>
                <Divider />
              </>
            ) : null}
            {(venue.genrePreferences.length > 0 || (venue.subVibe && venue.subVibe.length > 0)) ? (
              <>
                <Section label="Genre Preferences">
                  <View style={styles.chipRow}>
                    {venue.genrePreferences.map((g) => <Chip key={g} label={g} />)}
                    {(venue.subVibe ?? []).map((sv) => <Chip key={sv} label={sv} />)}
                  </View>
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
            {venue.rulesTemplate ? (
              <>
                <Section label="Venue Rules">
                  <Text style={[styles.cardBody, { color: colors.foreground }]}>{venue.rulesTemplate}</Text>
                </Section>
                <Divider />
              </>
            ) : null}
            {(venue.instagramUrl || venue.musicLink) && (() => {
              const links = [
                venue.instagramUrl && {
                  key: 'instagram', label: 'Instagram',
                  url: venue.instagramUrl.startsWith('http') ? venue.instagramUrl : `https://www.instagram.com/${venue.instagramUrl}`,
                },
                venue.musicLink && {
                  key: 'music', label: 'Music',
                  url: venue.musicLink.startsWith('http') ? venue.musicLink : `https://${venue.musicLink}`,
                },
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
                <Divider />
              </>
            ) : null}

            {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.greyBtn, { opacity: pressed ? 0.7 : 1, borderColor: colors.error, marginHorizontal: 20 }]}
              onPress={handleDelete}
            >
              <MaterialIcons name="delete" size={18} color={colors.error} />
              <Text style={[styles.greyBtnText, { color: colors.error }]}>Delete Venue</Text>
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
              <View style={styles.emptyCard}>
                <MaterialIcons name="event" size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 14 }}>No sets created yet</Text>
              </View>
            ) : (
              slots.sort((a, b) => a.date < b.date ? -1 : 1).map((slot) => {
                const booking = getBookingBySlot(slot.id);
                const dj = booking ? getArtistUser(booking.artistId) : undefined;
                const isDone = booking && (booking.status === 'completed' || booking.isCompleted);
                const isPending = booking && (booking.status === 'requested' || booking.status === 'past_confirmation');
                const dotColor = isDone ? '#2563EB' : isPending ? '#F59E0B' : '#22C55E';
                return (
                  <Pressable
                    key={slot.id}
                    style={({ pressed }) => [styles.slotRow, { opacity: pressed ? 0.6 : 1 }]}
                    onPress={() => {
                      if (booking) {
                        router.push(('/(manager)/booking-detail?id=' + booking.id) as Href);
                      } else {
                        router.push(('/(manager)/assign-artist?slotId=' + slot.id) as Href);
                      }
                    }}
                  >
                    {dj ? (
                      <AvatarImage uri={dj.profilePhotoUrl || undefined} avatarId={(dj as any).avatarId ?? undefined} seed={dj.id} name={dj.fullName} size={48} variant="artist" />
                    ) : (
                      <View style={[styles.slotPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <MaterialIcons name="event" size={22} color={colors.muted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.slotRowTitle, { color: colors.foreground }]} numberOfLines={1}>{dj ? dj.fullName : 'Unassigned'}</Text>
                      <Text style={[styles.slotRowSub, { color: colors.muted }]} numberOfLines={1}>
                        {formatDate(slot.date)} · {formatTime(slot.startTime)}–{formatTime(slot.endTime)}
                      </Text>
                    </View>
                    {booking ? (
                      <View style={[styles.slotStatusMark, { backgroundColor: dotColor }]} />
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
              <View style={styles.emptyCard}>
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
                const profile = getArtistProfile(a.artistId);
                return (
                  <View
                    key={a.id}
                    style={styles.lineupRow}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.lineupRowLeft, { opacity: pressed ? 0.6 : 1 }]}
                      onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + a.artistId) as Href)}
                    >
                      <AvatarImage uri={dj.profilePhotoUrl || undefined} avatarId={(dj as any).avatarId ?? undefined} seed={dj.id} name={dj.fullName} size={48} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text style={[styles.djName, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{dj.fullName}</Text>
                          {profile?.hasCompletedBooking && (
                            <MaterialIcons name="verified" size={15} color={colors.primary} />
                          )}
                        </View>
                        <Text style={[styles.djLocation, { color: colors.muted }]} numberOfLines={1}>{performerLabel(profile?.instruments)}</Text>
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
  scroll: { paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' },
  venuePhoto: { height: 180, borderRadius: 16, marginBottom: 16, marginHorizontal: 20 },
  infoCard: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  infoLeft: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { fontSize: 18, fontFamily: fonts.bodyBold, flexShrink: 1 },
  venueType: { fontSize: 13, fontWeight: '500' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationSectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationAddress: { fontSize: 14, lineHeight: 20, flex: 1 },
  mapsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  mapsBadgeText: { fontSize: 13, fontWeight: '700' },
  locationText: { fontSize: 13 },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  verifyPillText: { fontSize: 11, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16, marginHorizontal: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { gap: 12, paddingHorizontal: 20 },
  overviewTab: {},
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
  slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 2, gap: 12 },
  slotRowTitle: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  slotRowSub: { fontSize: 13 },
  slotStatusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  slotStatusMark: { width: 11, height: 11, borderRadius: 5.5, marginLeft: 6 },
  slotPlaceholder: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  djCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  djName: { fontSize: 15, fontWeight: '700' },
  djLocation: { fontSize: 13 },
  lineupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  lineupRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  linkRowText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
