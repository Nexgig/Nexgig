import { useRoleSwitching } from '@/lib/roles';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Alert, ActivityIndicator, Image, RefreshControl, ScrollView } from '@/lib/rn';
import { Modal } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { VenueFilterHeader } from '@/components/venue-filter-header';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useLineupStore, useNotificationStore, useVenueStore, useVenueFilterStore, usePendingAppsStore, useArtistDirectoryStore, useVenueDirectoryStore, useBookingStore, useInvoiceStore, mapVenueRow } from '@/lib/store';
import { PendingInvites } from '@/components/pending-invites';
import { ALLOW_ARTIST_VENUE_APPLICATIONS, SHOW_ARTIST_VERIFIED_BADGE } from '@/lib/features';
import { fonts } from '@/lib/fonts';
import { venueImage } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import { firstName } from '@/lib/utils';
import { AvatarImage } from '@/components/ui/avatar-image';
import { SectionSeparator } from '@/components/ui/month-separator';
import { ALLOW_DUAL_ROLE } from '@/lib/features';
import { supabase } from '@/lib/supabase';
import type { User, ArtistProfile, Venue } from '@/lib/types';

type NetworkTab = 'artists' | 'venues';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Application = {
  id: string;
  artist_id: string;
  venue_id: string;
  status: string;
  created_at: string;
  artist: { full_name: string; primary_genre: string; based_in: string; profile_photo_url: string } | null;
  venue: { name: string } | null;
};

/** "night_club" -> "Night club" */
function venueTypeLabel(t?: string | null): string {
  if (!t) return '';
  const s = t.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function NetworkScreen() {
  const router = useRouter();
  const colors = useColors();
  // Drops the RefreshControl during a role switch — unmounting one with the group
  // crashes natively. See useRoleSwitching.
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const { tab: initialTab } = useLocalSearchParams<{ tab?: NetworkTab }>();
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const currentUser = useAuthStore((s) => s.currentUser);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const allVenues = useVenueStore((s) => s.venues);
  const setPendingCount = usePendingAppsStore((s) => s.setCount);

  const [activeTab] = useState<NetworkTab>('artists');  // Roster = artists only (venues tab removed)

  // ── Month picker (plain calendar months) — drives the per-artist gig count ──
  const [monthAnchor, setMonthAnchor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPrefix = `${monthAnchor.year}-${String(monthAnchor.month + 1).padStart(2, '0')}`;   // 'YYYY-MM'
  // 13 months back → current → 2 forward, newest first.
  const monthOptions = useMemo(() => {
    const out: { year: number; month: number }[] = [];
    const base = new Date();
    for (let i = 2; i >= -13; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      out.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return out;
  }, []);

  // Per-artist COMPLETED-gig count for the picked calendar month (1st→last, live).
  const bookings = useBookingStore((s) => s.bookings);
  const gigCount = useCallback((artistId: string) => bookings.filter((b) =>
    b.artistId === artistId &&
    b.managerId === currentUser?.id &&
    (b.isCompleted || b.status === 'completed') &&
    (b.slotDate ?? '').startsWith(monthPrefix)
  ).length, [bookings, currentUser?.id, monthPrefix]);

  // Per-artist COST for the picked month = sum of the price on this manager's COMMITTED gigs
  // (confirmed + completed) that month. Requested/cancelled/declined don't count as spend.
  const isCommittedThisMonth = useCallback((b: (typeof bookings)[number], artistId?: string) =>
    b.managerId === currentUser?.id &&
    (artistId ? b.artistId === artistId : true) &&
    (b.status === 'confirmed' || b.status === 'completed' || b.isCompleted) &&
    (b.slotDate ?? '').startsWith(monthPrefix), [currentUser?.id, monthPrefix]);
  const gigCost = useCallback((artistId: string) =>
    bookings.filter((b) => isCommittedThisMonth(b, artistId)).reduce((sum, b) => sum + (b.price ?? 0), 0),
    [bookings, isCommittedThisMonth]);
  const rosterMonthCost = useMemo(() =>
    bookings.filter((b) => isCommittedThisMonth(b)).reduce((sum, b) => sum + (b.price ?? 0), 0),
    [bookings, isCommittedThisMonth]);

  // How many of an artist's completed gigs (with this manager) no non-cancelled invoice covers yet.
  const allInvoices = useInvoiceStore((s) => s.invoices);
  const invoicedBookingIds = useMemo(() =>
    new Set(allInvoices.filter((inv) => inv.status !== 'cancelled').flatMap((inv) => inv.gigs.map((g) => g.bookingId))),
    [allInvoices]);
  const uninvoicedCount = useCallback((artistId: string) =>
    bookings.filter((b) =>
      b.artistId === artistId && b.managerId === currentUser?.id &&
      (b.isCompleted || b.status === 'completed') && !invoicedBookingIds.has(b.id)
    ).length, [bookings, currentUser?.id, invoicedBookingIds]);

  // ── Applications state ────────────────────────────────────────────────────
  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'artists') { await fetchApplications(); await fetchArtists(); }
    else await fetchVenues();
    setRefreshing(false);
  }, [activeTab]);

  // ── Artists state ─────────────────────────────────────────────────────────
  const [sbArtists, setSbArtists] = useState<User[]>([]);
  const [sbProfiles, setSbProfiles] = useState<ArtistProfile[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);

  // ── Venues state ──────────────────────────────────────────────────────────
  // Seeded from the PERSISTED venue directory so the list paints on first frame
  // instead of sitting on a spinner until the network answers (~30s when slow).
  // Refreshed below by fetchVenues; the directory is tiny, so never worth waiting for.
  const [sbVenues, setSbVenues] = useState<Venue[]>(() =>
    useVenueDirectoryStore.getState().listVenues()
  );
  const [venuesLoading, setVenuesLoading] = useState(false);
  // Tracks "fetched this mount", NOT "have any data" — sbVenues now starts warm from
  // the cache, so guarding the fetch on sbVenues.length would mean never refreshing.
  const [venuesFetched, setVenuesFetched] = useState(false);

  // ── Fetch applications + artists on mount (Artists is the default tab) ─────
  useEffect(() => { fetchApplications(); }, []);

  // Keep the Network tab badge in sync with the live pending list so
  // accept/decline clears it instantly (no focus change / realtime needed).
  useEffect(() => {
    if (!appsLoading) setPendingCount(applications.length);
  }, [applications.length, appsLoading, setPendingCount]);

  // ── Fetch artists/venues when switching to that tab and data is empty ──────
  useEffect(() => {
    if (activeTab === 'artists' && sbArtists.length === 0) fetchArtists();
    if (activeTab === 'venues' && !venuesFetched) fetchVenues();
  }, [activeTab]);

  const fetchApplications = async () => {
    // Artists can no longer apply, so nothing new can arrive. Leaving `applications`
    // empty hides the whole inbox in one place: the inline Accept/Decline rows read
    // from appByArtistId, and the tab badge from applications.length. Existing rows
    // stay in the DB untouched — flip the flag back and they reappear.
    if (!ALLOW_ARTIST_VENUE_APPLICATIONS) { setApplications([]); setAppsLoading(false); return; }
    if (!currentUser) return;
    setAppsLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('id, artist_id, venue_id, status, created_at')
      .eq('manager_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      const artistIds = data.map((a) => a.artist_id);
      const venueIds = data.map((a) => a.venue_id);
      const [{ data: artistsData }, { data: venuesData }] = await Promise.all([
        supabase.from('artists').select('id, full_name, primary_genre, based_in, profile_photo_url').in('id', artistIds),
        supabase.from('venues').select('id, name').in('id', venueIds),
      ]);
      const artistMap = Object.fromEntries((artistsData ?? []).map((a) => [a.id, a]));
      const venueMap = Object.fromEntries((venuesData ?? []).map((v) => [v.id, v]));
      setApplications(data.map((app) => ({ ...app, artist: artistMap[app.artist_id] ?? null, venue: venueMap[app.venue_id] ?? null })) as any);
    } else {
      setApplications([]);
    }
    setAppsLoading(false);
  };

  const fetchArtists = async () => {
    setArtistsLoading(true);
    // Read public artist profiles from the artists table ONLY (it's world-readable
    // to authenticated users). We deliberately do NOT read the users table here —
    // it holds private PII (email, phone, push_token) and is locked to own-row.
    // The artists table carries everything the Network cards need (name, photo,
    // based_in, primary_genre, ...), all keyed by id = the artist's auth id.
    const { data } = await supabase.from('artists').select('*');
    if (data) {
      setSbArtists(data.map((a: any) => ({
        id: a.id, email: '', phone: '', accountType: 'artist' as const,
        fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined, avatarId: a.avatar_id ?? undefined, bio: a.bio ?? undefined,
        location: a.based_in ?? undefined, yearsOfExperience: a.years_of_experience ?? undefined,
        isPhoneVerified: false, isEmailVerified: false,
        createdAt: a.created_at, updatedAt: a.updated_at,
      })));
      // sbProfiles is keyed by id (= user.id) so getProfile(user.id) matches and
      // the card genre subtitle renders (previously keyed by a non-existent
      // user_id, so primaryGenre always fell back to 'Artist').
      setSbProfiles(data.map((a: any) => ({
        userId: a.id, primaryGenre: a.primary_genre, secondaryGenres: a.secondary_genres ?? [],
        hasCompletedBooking: a.has_completed_booking ?? false,
        energyTypes: [], instruments: a.instruments ?? [],
        socialLinks: undefined, ratePerHour: a.min_rate ?? undefined, bio: a.bio ?? undefined,
        createdAt: a.created_at, updatedAt: a.updated_at,
      })));
      // Cache the FULL artist data in the shared directory store so tapping any artist
      // here opens their profile complete on the first frame (no fetch-on-open).
      useArtistDirectoryStore.getState().setArtists(data.map((a: any) => ({
        user: {
          id: a.id, email: '', phone: '', accountType: 'artist' as const,
          fullName: a.full_name, profilePhotoUrl: a.profile_photo_url ?? undefined, avatarId: a.avatar_id ?? undefined, bio: a.bio ?? undefined,
          location: a.based_in ?? undefined, yearsOfExperience: a.years_of_experience ?? undefined,
          isPhoneVerified: false, isEmailVerified: false,
          createdAt: a.created_at, updatedAt: a.updated_at,
        },
        profile: {
          userId: a.id, primaryGenre: a.primary_genre,
          secondaryGenres: Array.isArray(a.secondary_genres) ? a.secondary_genres : [],
          instruments: Array.isArray(a.instruments) ? a.instruments : [],
          minRate: a.min_rate ?? undefined, gender: a.gender ?? undefined,
          basedIn: a.based_in ?? undefined, nationality: a.nationality ?? undefined,
          isHistoryHidden: a.is_history_hidden ?? false,
          hasCompletedBooking: a.has_completed_booking ?? false,
          instagramUrl: a.instagram_url ?? undefined, soundcloudUrl: a.soundcloud_url ?? undefined,
          mixcloudUrl: a.mixcloud_url ?? undefined, spotifyUrl: a.spotify_url ?? undefined,
        },
      })));
    }
    setArtistsLoading(false);
  };

  const fetchVenues = async () => {
    // Only block on the spinner when there's nothing cached to show (first ever
    // launch). Otherwise the stale list stays up and swaps when the fetch lands.
    if (sbVenues.length === 0) setVenuesLoading(true);
    const { data } = await supabase.from('venues').select('*').neq('is_hidden', true);
    if (data) {
      const mapped = data.map((v: any) => mapVenueRow(v));
      setSbVenues(mapped);
      // Cache full venue data so tapping a venue opens its detail complete (no
      // fetch-on-open) AND so the next launch paints instantly — the store is persisted.
      useVenueDirectoryStore.getState().setVenues(mapped);
    }
    setVenuesFetched(true);
    setVenuesLoading(false);
  };

  const getProfile = (userId: string) => sbProfiles.find((p) => p.userId === userId);

  // Map artist_id -> their pending application, so an applicant row shows
  // Accept/Decline inline instead of the Add button (no separate section).
  const appByArtistId = useMemo(
    () => new Map(applications.map((a) => [a.artist_id, a])),
    [applications]
  );

  const [search, setSearch] = useState('');

  /** In this manager's active lineup. Single source of truth — the filter below and the
   *  row's Connected state both use it, so they can never disagree. */
  const isInMyLineup = useCallback(
    (artistId: string) => globalLineup.some(
      (r) => r.artistId === artistId && r.managerId === currentUser?.id && r.status === 'active'
    ),
    [globalLineup, currentUser?.id]
  );

  // No All/Mine toggle any more — the list is SPLIT into two labelled groups instead:
  // the manager's own first, then everyone else, alphabetical within each. The sort keeps
  // each group contiguous, which is what lets renderItem draw a header on the boundary
  // (same MonthSeparator the dashboard uses between months).
  const isMyVenue = useCallback(
    (v: { managerId?: string }) => v.managerId === currentUser?.id,
    [currentUser?.id]
  );

  // Roster respects the shared venue filter: with a venue selected, show only artists
  // assigned to that venue's lineup ('All Venues' => everyone).
  const sharedVenueId = useVenueFilterStore((s) => s.venueId);
  const venueArtistIds = useMemo(
    () => sharedVenueId
      ? new Set(venueAssignments.filter((a) => a.venueId === sharedVenueId && a.status === 'active').map((a) => a.artistId))
      : null,
    [venueAssignments, sharedVenueId]
  );

  const filteredArtists = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Roster = ONLY the manager's own artists (in their active lineup). Still narrowed by
    // the shared venue filter (a selected venue → only that venue's assigned artists).
    return [...sbArtists.filter((u) => ALLOW_DUAL_ROLE || u.id !== currentUser?.id)]
      .filter((u) => isInMyLineup(u.id))
      .filter((u) => !venueArtistIds || venueArtistIds.has(u.id))
      .filter((u) => !q || (u.fullName ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.fullName ?? '').toLowerCase().localeCompare((b.fullName ?? '').toLowerCase()));
  }, [sbArtists, currentUser?.id, search, isInMyLineup, venueArtistIds]);

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...sbVenues]
      .filter((v) => !q
        || v.name.toLowerCase().includes(q)
        || (v.venueType ?? '').toLowerCase().includes(q)
        || (v.googleMapsLocation?.address ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        const aMine = isMyVenue(a);
        const bMine = isMyVenue(b);
        if (aMine !== bMine) return aMine ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
  }, [sbVenues, search, currentUser?.id, isMyVenue]);

  // ── Accept / Decline handlers ─────────────────────────────────────────────
  const handleAccept = async (app: Application) => {
    Alert.alert('Accept Application', `Accept ${app.artist?.full_name} for ${app.venue?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          if (!currentUser) return;
          setProcessingId(app.id);
          const { error } = await supabase.from('applications')
            .update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', app.id);
          if (error) { setProcessingId(null); Alert.alert('Error', error.message); return; }
          await supabase.from('global_lineup').upsert(
            { manager_id: currentUser.id, artist_id: app.artist_id, status: 'active' },
            { onConflict: 'manager_id,artist_id' }
          );
          // All-or-nothing model: accepting a join request adds the artist to the
          // manager's whole lineup — i.e. EVERY current venue — not just the one they
          // happened to apply from. Mirrors handleAddToRoster.
          const acceptVenues = allVenues.filter((v) => v.managerId === currentUser.id && !v.isHidden);
          if (acceptVenues.length > 0) {
            const rows = acceptVenues.map((v) => ({
              manager_id: currentUser.id, artist_id: app.artist_id, venue_id: v.id, status: 'active',
            }));
            await supabase.from('venue_assignments').upsert(rows, { onConflict: 'venue_id,artist_id' });
          }
          const lineupStore = useLineupStore.getState();
          lineupStore.addArtistUser({
            id: app.artist_id, email: '', phone: '', accountType: 'artist' as const,
            fullName: app.artist?.full_name ?? '', profilePhotoUrl: app.artist?.profile_photo_url ?? undefined,
            isPhoneVerified: false, isEmailVerified: true,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
          lineupStore.addToGlobalLineup({
            id: `${currentUser.id}-${app.artist_id}`, managerId: currentUser.id,
            artistId: app.artist_id, status: 'active' as const, addedAt: new Date().toISOString(),
          });
          acceptVenues.forEach((v) => {
            lineupStore.assignToVenue({
              id: `va-${v.id}-${app.artist_id}`,
              globalLineupId: `${currentUser.id}-${app.artist_id}`,
              venueId: v.id, artistId: app.artist_id,
              assignedAt: new Date().toISOString(), status: 'active' as const,
            });
          });
          setProcessingId(null);
          setApplications((prev) => prev.filter((a) => a.id !== app.id));
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: app.artist_id,
            type: 'lineup_added' as any,
            title: 'Added to Roster',
            body: `${firstName(currentUser.fullName, 'A manager')} added you to their roster — you can now be booked at their venues`,
            isRead: false,
            relatedId: currentUser.id,
            relatedType: 'manager',
            createdAt: new Date().toISOString(),
          });
          // No email — the artist is already on Nexgig, so the in-app notification above
          // (+ push) is enough.
        },
      },
    ]);
  };

  const handleDecline = async (app: Application) => {
    Alert.alert('Decline Application', `Decline ${app.artist?.full_name} for ${app.venue?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setProcessingId(app.id);
          const { error } = await supabase.from('applications')
            .update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', app.id);
          setProcessingId(null);
          if (error) { Alert.alert('Error', error.message); return; }
          setApplications((prev) => prev.filter((a) => a.id !== app.id));
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: app.artist_id,
            type: 'lineup_declined',
            title: 'Request Declined',
            body: `${app.venue?.name ?? 'The venue'} declined your request to join`,
            isRead: false,
            relatedId: app.venue_id,
            relatedType: 'venue',
            createdAt: new Date().toISOString(),
          });
        },
      },
    ]);
  };

  // ── Add an existing artist to the manager's roster + all current venues ────
  const handleAddToRoster = async (artist: User) => {
    if (!currentUser) return;
    setProcessingId(artist.id);

    const managerVenues = allVenues.filter((v) => v.managerId === currentUser.id && !v.isHidden);

    // 1. Roster row
    const { error: lineupError } = await supabase.from('global_lineup').upsert(
      { manager_id: currentUser.id, artist_id: artist.id, status: 'active' },
      { onConflict: 'manager_id,artist_id' }
    );
    if (lineupError) { setProcessingId(null); Alert.alert('Error', lineupError.message); return; }

    // 2. Assign to every current venue
    if (managerVenues.length > 0) {
      const rows = managerVenues.map((v) => ({
        manager_id: currentUser.id, artist_id: artist.id, venue_id: v.id, status: 'active',
      }));
      await supabase.from('venue_assignments').upsert(rows, { onConflict: 'venue_id,artist_id' });
    }

    // 3. Local store updates so the row flips to Connected immediately
    const lineupStore = useLineupStore.getState();
    lineupStore.addArtistUser({
      id: artist.id, email: artist.email ?? '', phone: '', accountType: 'artist' as const,
      fullName: artist.fullName ?? '', profilePhotoUrl: artist.profilePhotoUrl ?? undefined,
      isPhoneVerified: false, isEmailVerified: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    lineupStore.addToGlobalLineup({
      id: `${currentUser.id}-${artist.id}`, managerId: currentUser.id,
      artistId: artist.id, status: 'active' as const, addedAt: new Date().toISOString(),
    });
    managerVenues.forEach((v) => {
      lineupStore.assignToVenue({
        id: `va-${v.id}-${artist.id}`,
        globalLineupId: `${currentUser.id}-${artist.id}`,
        venueId: v.id, artistId: artist.id,
        assignedAt: new Date().toISOString(), status: 'active' as const,
      });
    });

    addNotification({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: artist.id,
      type: 'lineup_added' as any,
      title: 'Added to Roster',
      body: `${firstName(currentUser.fullName, 'A manager')} added you to their roster — you can now be booked at their venues`,
      isRead: false,
      relatedId: currentUser.id,
      relatedType: 'manager',
      createdAt: new Date().toISOString(),
    });

    // No email — the artist is already on Nexgig, so the in-app notification above
    // (+ push) is enough.

    setProcessingId(null);
  };

  // ── Disconnect an artist from this manager (lineup + all venue assignments) ─
  const handleDisconnect = (artist: User) => {
    if (!currentUser) return;
    Alert.alert(
      'Disconnect Artist',
      `Disconnect ${artist.fullName}? They'll be removed from your roster and all your venues.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: async () => {
          useLineupStore.getState().removeFromGlobalLineup(artist.id);
          // DELETE the rows (do NOT update status='removed' — that violates a check
          // constraint on venue_assignments and fails silently, so the artist returns
          // on the next re-sync / sign-in).
          const { error: glErr } = await supabase.from('global_lineup').delete()
            .eq('manager_id', currentUser.id).eq('artist_id', artist.id);
          if (glErr) console.warn('Failed to remove global_lineup row:', glErr.message);
          const { error: vaErr } = await supabase.from('venue_assignments').delete()
            .eq('manager_id', currentUser.id).eq('artist_id', artist.id);
          if (vaErr) console.warn('Failed to remove venue_assignments rows:', vaErr.message);
          addNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: artist.id,
            type: 'lineup_removed' as any,
            title: 'Removed from Roster',
            body: `${firstName(currentUser.fullName, 'A manager')} removed you from their roster — you can no longer be booked at their venues`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }},
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Venue filter */}
      <View style={styles.header}>
        <VenueFilterHeader />
      </View>

      {/* ROSTER label + month picker (the per-artist gig count is for this month) */}
      <View style={styles.rosterBar}>
        <Text style={[styles.rosterLabel, { color: colors.muted }]}>ROSTER</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {rosterMonthCost > 0 && (
            <Text style={[styles.rosterCost, { color: colors.primary }]}>AED {rosterMonthCost.toLocaleString()}</Text>
          )}
          <Pressable style={styles.monthBtn} onPress={() => setMonthPickerOpen(true)} hitSlop={8}>
            <Text style={[styles.monthBtnText, { color: colors.foreground }]}>{MONTHS[monthAnchor.month]}</Text>
            <MaterialIcons name="expand-more" size={18} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      {artistsLoading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredArtists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          ItemSeparatorComponent={() => <View style={[styles.rowSep, { backgroundColor: colors.border }]} />}
          ListHeaderComponent={<PendingInvites />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialIcons name="people" size={44} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No artists in your roster</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Invite artists to build your roster.</Text>
            </View>
          }
          ListFooterComponent={
            <View style={[styles.inviteFooter, { borderTopColor: colors.border }]}>
              <Pressable style={({ pressed }) => [styles.inviteRow, { opacity: pressed ? 0.6 : 1 }]} onPress={() => router.push('/(manager)/invite-artists' as Href)}>
                <MaterialIcons name="person-add-alt-1" size={22} color={colors.primary} />
                <Text style={[styles.inviteText, { color: colors.primary }]}>Add artists</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: user }) => {
            const profile = getProfile(user.id);
            const count = gigCount(user.id);
            const cost = gigCost(user.id);
            const uninv = uninvoicedCount(user.id);
            return (
              <Pressable
                style={({ pressed }) => [styles.rowCard, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => router.push(('/(manager)/artist-profile-view?artistId=' + user.id + '&name=' + encodeURIComponent(user.fullName ?? '') + '&photo=' + encodeURIComponent(user.profilePhotoUrl ?? '') + '&genre=' + encodeURIComponent(profile?.primaryGenre ?? '')) as Href)}
              >
                <View style={styles.cardLeft}>
                  <AvatarImage uri={user.profilePhotoUrl || undefined} avatarId={(user as any).avatarId ?? undefined} seed={user.id} name={user.fullName} size={48} />
                  <View style={styles.cardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>{user.fullName}</Text>
                      {SHOW_ARTIST_VERIFIED_BADGE && profile?.hasCompletedBooking && (
                        <MaterialIcons name="verified" size={15} color={colors.primary} />
                      )}
                    </View>
                    <Text style={[styles.cardSub, { color: uninv > 0 ? colors.warning : colors.muted }]} numberOfLines={1}>
                      {uninv > 0 ? `${uninv} gig${uninv === 1 ? '' : 's'} not invoiced` : 'Up to date'}
                    </Text>
                  </View>
                </View>
                <View style={styles.gigWrap}>
                  <Text style={[styles.gigCountLine, { color: colors.foreground }]}>{count} gig{count === 1 ? '' : 's'}</Text>
                  {cost > 0 && <Text style={[styles.gigCost, { color: colors.primary }]}>AED {cost.toLocaleString()}</Text>}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Month picker — tap outside to dismiss */}
      <Modal visible={monthPickerOpen} transparent animationType="fade" onRequestClose={() => setMonthPickerOpen(false)}>
        <Pressable style={styles.monthBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <View style={[styles.monthCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {monthOptions.map((o) => {
                const sel = o.year === monthAnchor.year && o.month === monthAnchor.month;
                return (
                  <Pressable key={`${o.year}-${o.month}`} style={styles.monthOption} onPress={() => { setMonthAnchor(o); setMonthPickerOpen(false); }}>
                    <Text style={[styles.monthOptionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{MONTHS[o.month]} {o.year}</Text>
                    {sel && <MaterialIcons name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, minHeight: 72 },
  rosterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  rosterLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  rosterCost: { fontSize: 14, fontWeight: '800' },
  monthBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  monthBtnText: { fontSize: 15, fontWeight: '600' },
  rowSep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  gigWrap: { alignItems: 'flex-end', paddingLeft: 10 },
  gigNum: { fontSize: 18, fontWeight: '800' },
  gigLabel: { fontSize: 12, marginTop: -1 },
  gigCountLine: { fontSize: 15, fontWeight: '800' },
  gigCost: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  inviteFooter: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 4 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  inviteText: { fontSize: 16, fontWeight: '700' },
  monthBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  monthCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 6, minWidth: 220, overflow: 'hidden' },
  monthOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  monthOptionText: { fontSize: 15 },
  headerAddBtn: { alignItems: 'flex-end' },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  verifiedPillText: { fontSize: 10, fontWeight: '700' },
  // Copied from the old my-venues so the pending/rejected pill looks the same as it did.
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  verifyPillText: { fontSize: 10, fontWeight: '700' },
  cardSub: { fontSize: 13, marginBottom: 0 },
  cardMeta: { fontSize: 12 },
  cardVenue: { fontSize: 13, fontWeight: '600' },
  thumb: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { fontSize: 14, fontWeight: '600' },
  acceptBtn: { flex: 1, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  connectedText: { fontSize: 11, fontWeight: '700' },
  connectedWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disconnectIconBtn: { padding: 7, borderRadius: 6 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, minWidth: 72 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  respondRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  respondBtn: { borderRadius: 6, paddingHorizontal: 13, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
});