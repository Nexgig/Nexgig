import { VenueInvoicesList } from '@/components/venue-invoices-list';
import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Linking, ActivityIndicator } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import type { Venue } from '@/lib/types';
import { ScreenContainer } from '@/components/screen-container';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore, useAuthStore, useNotificationStore, useVenueDirectoryStore, mapVenueRow } from '@/lib/store';
import { venueImage } from '@/lib/venue-images';
import { setsForDay, DAY_SHORT } from '@/lib/venue-schedule';
import { useColors } from '@/hooks/use-colors';
import { formatDate, formatTime } from '@/lib/conflict-detection';
import { syncBookingStatus } from '@/lib/booking-sync';
import { cityFromAddress } from '@/lib/places';
import { ReportModal } from '@/components/report-modal';
import { supabase } from '@/lib/supabase';
import { genreLabel, firstName } from '@/lib/utils';
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
  // hideVenue is NOT the (removed) hide feature — it's the soft-delete used by
  // handleDelete below. Keep.
  const hideVenue = useVenueStore((s) => s.hideVenue);
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
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const removeFromVenue = useLineupStore((s) => s.removeFromVenue);

  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'roster' | 'invoices'>('overview');
  const [showReport, setShowReport] = useState(false);

  const slots = useMemo(() => venue ? getSlotsByVenue(venue.id) : [], [venue, getSlotsByVenue]);
  const venueAssignments = useMemo(
    () => venue ? allVenueAssignments.filter((a) => a.venueId === venue.id && a.status === 'active') : [],
    [venue, allVenueAssignments]
  );

  // Roster tab: artists playing THIS venue, and the manager's roster artists not yet on it.
  const venueArtistIds = useMemo(() => new Set(venueAssignments.map((a) => a.artistId)), [venueAssignments]);
  const venueArtists = useMemo(() =>
    venueAssignments
      .map((a) => ({ artistId: a.artistId, user: getArtistUser(a.artistId), profile: getArtistProfile(a.artistId) }))
      .filter((x) => !!x.user)
      .sort((a, b) => (a.user!.fullName ?? '').toLowerCase().localeCompare((b.user!.fullName ?? '').toLowerCase())),
    [venueAssignments, getArtistUser, getArtistProfile]);
  const addableArtists = useMemo(() =>
    globalLineup
      .filter((r) => r.managerId === currentUser?.id && r.status === 'active' && !venueArtistIds.has(r.artistId))
      .map((r) => ({ artistId: r.artistId, user: getArtistUser(r.artistId), profile: getArtistProfile(r.artistId) }))
      .filter((x) => !!x.user)
      .sort((a, b) => (a.user!.fullName ?? '').toLowerCase().localeCompare((b.user!.fullName ?? '').toLowerCase())),
    [globalLineup, currentUser?.id, venueArtistIds, getArtistUser, getArtistProfile]);

  const addToThisVenue = async (artistId: string) => {
    if (!venue || !currentUser) return;
    const now = new Date().toISOString();
    assignToVenue({ id: `va-${venue.id}-${artistId}`, globalLineupId: `${currentUser.id}-${artistId}`, venueId: venue.id, artistId, assignedAt: now, status: 'active' });
    await supabase.from('venue_assignments').upsert(
      { manager_id: currentUser.id, artist_id: artistId, venue_id: venue.id, status: 'active' },
      { onConflict: 'venue_id,artist_id' });
  };

  const removeFromThisVenue = (artistId: string, name: string) => {
    if (!venue || !currentUser) return;
    const v = venue, uid = currentUser.id;
    Alert.alert('Remove from venue', `Remove ${name} from ${v.name}? They stay on your roster and any other venues.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        removeFromVenue(v.id, artistId); // optimistic
        supabase.from('venue_assignments').update({ status: 'removed' }).eq('venue_id', v.id).eq('artist_id', artistId)
          .then(({ error }) => {
            if (error) {
              console.warn('remove from venue:', error.message);
              assignToVenue({ id: `va-${v.id}-${artistId}`, globalLineupId: `${uid}-${artistId}`, venueId: v.id, artistId, assignedAt: new Date().toISOString(), status: 'active' });
              Alert.alert('Could not remove', 'Something went wrong — please try again.');
            }
          });
      } },
    ]);
  };

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

  // ── Delete Venue ──────────────────────────────────────────────────────────
  // Moved here from edit-venue's Danger Zone. Cancels active bookings + notifies
  // affected artists, then soft-hides the venue (is_hidden=true) so completed-gig
  // history keeps resolving the real venue name. Behaviour is identical to the old
  // edit-venue handler — only the button's location changed.
  const handleDelete = async () => {
    // Block deletion while the venue still has a COMPLETED gig nobody has invoiced.
    // Otherwise that gig lingers on the artist's "to invoice" list pointing at a venue that
    // no longer exists — a count they can never clear, and the reason the invoice tab showed
    // gigs that opened to an empty list. (An admin can still force-remove it directly in the
    // database if ever needed.)
    //
    // Fetched FRESH, not from the local stores: a stale store could wrongly allow the delete
    // (the exact bug) or wrongly block it. On a fetch error we block and ask to retry rather
    // than risk deleting on incomplete information.
    try {
      const [done, inv] = await Promise.all([
        supabase.from('bookings').select('id').eq('venue_id', venue.id).eq('status', 'completed'),
        supabase.from('invoices').select('gigs').eq('venue_id', venue.id).neq('status', 'cancelled'),
      ]);
      if (done.error || inv.error) {
        Alert.alert('Could not verify', 'We couldn’t check this venue’s gigs. Check your connection and try again.');
        return;
      }
      const invoicedIds = new Set(
        (inv.data ?? []).flatMap((row: any) => (row.gigs ?? []).map((g: any) => g.bookingId))
      );
      const uninvoiced = (done.data ?? []).filter((b: any) => !invoicedIds.has(b.id));
      if (uninvoiced.length > 0) {
        const many = uninvoiced.length > 1;
        Alert.alert(
          'Can’t delete this venue yet',
          `"${venue.name}" has ${uninvoiced.length} completed gig${many ? 's' : ''} that ${many ? 'haven’t' : 'hasn’t'} been invoiced. Once the artist${many ? 's' : ''} invoice${many ? '' : 's'} ${many ? 'them' : 'it'}, you’ll be able to delete it.`,
          [{ text: 'OK' }]
        );
        return;
      }
    } catch {
      Alert.alert('Could not verify', 'We couldn’t check this venue’s gigs. Check your connection and try again.');
      return;
    }

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
                title: isRequested ? 'Request Withdrawn' : 'Gig Cancelled',
                body: `${firstName(currentUser?.fullName, 'The manager')} ${isRequested ? 'withdrew the request for' : 'cancelled'} ${booking.venueName ?? venue.name}, ${snapDate ? formatDate(snapDate) : ''}`,
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
        <View style={styles.venuePhotoWrap}>
          <Image source={venueImage(venue.venueType)} style={styles.venuePhoto} resizeMode="cover" />
        </View>

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

        {/* Tab Bar — Sets only visible to the venue owner. The Lineup list lived here
            too; it moved to the artist's profile, which is where a manager adds and removes
            an artist's venues. */}
        {isOwner && (
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['overview', 'schedule', 'roster', 'invoices'] as const).map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.muted }]}>
                  {tab === 'overview' ? 'Overview' : tab === 'schedule' ? 'Schedule' : tab === 'roster' ? 'Roster' : 'Invoices'}
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
                    <Text style={[styles.locationAddress, { color: colors.foreground }]}>{venue.googleMapsLocation.address}</Text>
                    <MapsBadge
                      onPress={() => {
                        const loc = venue.googleMapsLocation;
                        const url = (loc?.lat && loc?.lng)
                          ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
                          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc?.address || venue.name || '')}`;
                        Linking.openURL(url);
                      }}
                    />
                  </View>
                </Section>
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

        {/* Schedule Tab — owner only. The weekly programme that auto-fills the calendar.
            Read summary here; tap Edit to open the full editor. */}
        {isOwner && activeTab === 'schedule' && (
          <View style={styles.scheduleTab}>
            {(venue.schedule ?? []).length === 0 ? (
              <Text style={[styles.scheduleEmptyText, { color: colors.muted }]}>No Schedule yet</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const sets = setsForDay(venue.schedule, d);
                  if (sets.length === 0) return null;
                  return (
                    <View key={d} style={[styles.scheduleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.scheduleDayLabel, { color: colors.foreground }]}>{DAY_SHORT[d]}</Text>
                      <Text style={[styles.scheduleTimes, { color: colors.muted }]} numberOfLines={2}>
                        {sets.map((s) => `${s.startTime}–${s.endTime}`).join('   ·   ')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Pressable
              onPress={() => router.push(('/(manager)/edit-schedule?id=' + venue.id) as any)}
              style={({ pressed }) => [styles.scheduleEditBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialIcons name="edit-calendar" size={18} color="#fff" />
              <Text style={styles.scheduleEditText}>
                {(venue.schedule ?? []).length > 0 ? 'Edit programme' : 'Set up programme'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Roster Tab — owner only. Artists playing THIS venue; add/remove per-venue without
            touching the manager's global roster. */}
        {isOwner && activeTab === 'roster' && (
          <View style={styles.rosterTab}>
            <Text style={[styles.rosterLabel, { color: colors.muted }]}>PLAYING THIS VENUE</Text>
            {venueArtists.length === 0 ? (
              <Text style={[styles.rosterEmpty, { color: colors.muted }]}>No artists on this venue yet.</Text>
            ) : (
              venueArtists.map(({ artistId, user, profile }) => (
                <View key={artistId} style={[styles.rosterRow, { borderBottomColor: colors.border }]}>
                  <AvatarImage uri={user!.profilePhotoUrl || undefined} avatarId={(user as any)?.avatarId ?? undefined} seed={artistId} name={user!.fullName} size={44} variant="artist" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rosterName, { color: colors.foreground }]} numberOfLines={1}>{user!.fullName}</Text>
                    <Text style={[styles.rosterSub, { color: colors.muted }]} numberOfLines={1}>{genreLabel(profile?.primaryGenre, profile?.instruments)}</Text>
                  </View>
                  <Pressable onPress={() => removeFromThisVenue(artistId, user!.fullName ?? 'this artist')} hitSlop={8} style={({ pressed }) => [styles.rosterRemoveBtn, { borderColor: colors.error, opacity: pressed ? 0.6 : 1 }]}>
                    <Text style={[styles.rosterRemoveText, { color: colors.error }]}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}

            {addableArtists.length > 0 && (
              <>
                <Text style={[styles.rosterLabel, { color: colors.muted, marginTop: 24 }]}>ADD FROM YOUR ROSTER</Text>
                {addableArtists.map(({ artistId, user, profile }) => (
                  <View key={artistId} style={[styles.rosterRow, { borderBottomColor: colors.border }]}>
                    <AvatarImage uri={user!.profilePhotoUrl || undefined} avatarId={(user as any)?.avatarId ?? undefined} seed={artistId} name={user!.fullName} size={44} variant="artist" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rosterName, { color: colors.foreground }]} numberOfLines={1}>{user!.fullName}</Text>
                      <Text style={[styles.rosterSub, { color: colors.muted }]} numberOfLines={1}>{genreLabel(profile?.primaryGenre, profile?.instruments)}</Text>
                    </View>
                    <Pressable onPress={() => addToThisVenue(artistId)} style={({ pressed }) => [styles.rosterAddBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
                      <Text style={styles.rosterAddText}>Add</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Invoices Tab — owner only. Every invoice sent for this venue, grouped by the
            month it was sent, with the invoice count per month and the artist named per row. */}
        {isOwner && activeTab === 'invoices' && (
          <VenueInvoicesList venueId={venue.id} />
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
  rosterTab: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  rosterLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  rosterEmpty: { fontSize: 14, paddingVertical: 8 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rosterName: { fontSize: 15, fontWeight: '600' },
  rosterSub: { fontSize: 13, marginTop: 1 },
  rosterRemoveBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  rosterRemoveText: { fontSize: 13, fontWeight: '700' },
  rosterAddBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  rosterAddText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scheduleTab: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  scheduleEmptyText: { fontSize: 15, paddingVertical: 8 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12 },
  scheduleDayLabel: { fontSize: 15, fontWeight: '700', width: 40 },
  scheduleTimes: { flex: 1, fontSize: 14, fontVariant: ['tabular-nums'] },
  scheduleEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  scheduleEditText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll: { paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' },
  venuePhotoWrap: { height: 180, borderRadius: 16, marginBottom: 16, marginHorizontal: 20, overflow: 'hidden' },
  venuePhoto: { width: '100%', height: '100%' },
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
  slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  slotRowTitle: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  slotRowSub: { fontSize: 13 },
  slotStatusDot: { fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 40, marginLeft: 6, transform: [{ translateY: -10 }] },
  slotStatusMark: { width: 11, height: 11, borderRadius: 5.5, marginLeft: 6 },
  slotPlaceholder: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  djCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  djName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  djLocation: { fontSize: 13 },
  lineupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  lineupRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  linkRowText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
