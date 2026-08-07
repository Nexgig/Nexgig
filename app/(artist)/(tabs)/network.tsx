import { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Image, RefreshControl } from '@/lib/rn';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useLineupStore, useBookingStore, useInvoiceStore } from '@/lib/store';
import { Divider } from '@/components/ui/card-free';
import { venueImage } from '@/lib/venue-images';
import { fonts } from '@/lib/fonts';
import { useColors } from '@/hooks/use-colors';
import { useRoleSwitching } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

const ROSTER_HINT = 'Venues appear here once a manager invites you to their roster.';

/**
 * The artist's Venues tab — the venues they're on the roster of, each with its invoicing
 * state. The document icon on the right opens the send-invoice flow when there are gigs to
 * invoice (coral), or the venue's sent-invoices tab when there's nothing outstanding (grey).
 */
export default function ArtistVenuesScreen() {
  const router = useRouter();
  const colors = useColors();
  const roleSwitching = useRoleSwitching((s) => s.switching);
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venueAssignments = useLineupStore((s) => s.venueAssignments);
  const allBookings = useBookingStore((s) => s.bookings);
  const invoices = useInvoiceStore((s) => s.invoices);
  const [refreshing, setRefreshing] = useState(false);

  // Pull the artist's active venue assignments from Supabase and hydrate any venue rows the
  // store is missing — mirrors app/(artist)/my-venues.tsx.
  const fetchVenues = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data: assignments } = await supabase
      .from('venue_assignments').select('*').eq('artist_id', currentUser.id).eq('status', 'active');
    if (!assignments || assignments.length === 0) {
      useLineupStore.getState().resetVenueAssignmentsForArtist(currentUser.id, []);
      return;
    }
    const known = new Set(allVenues.map((v) => v.id));
    const missing = assignments.map((a: any) => a.venue_id).filter((id: string) => !known.has(id));
    if (missing.length > 0) {
      const { data: venuesData } = await supabase.from('venues').select('*').in('id', missing);
      venuesData?.forEach((v: any) => {
        useVenueStore.getState().addVenue({
          id: v.id, managerId: v.manager_id, name: v.name, venueType: v.venue_type,
          genrePreferences: v.genre_preferences ?? [], preferredEnergy: v.preferred_energy ?? [],
          googleMapsLocation: { address: v.address ?? '', lat: v.lat ?? 0, lng: v.lng ?? 0, placeId: v.place_id ?? undefined }, color: v.color ?? '#2563EB',
          isHidden: v.is_hidden ?? false, isComplete: v.is_complete ?? false,
          createdAt: v.created_at, updatedAt: v.updated_at,
        });
      });
    }
    const fresh = assignments.map((a: any) => ({
      id: a.id, globalLineupId: `${a.manager_id}-${currentUser.id}`,
      venueId: a.venue_id, artistId: currentUser.id, assignedAt: a.created_at, status: 'active' as const,
    }));
    useLineupStore.getState().resetVenueAssignmentsForArtist(currentUser.id, fresh);
  }, [currentUser?.id]);

  useFocusEffect(useCallback(() => { fetchVenues(); }, [fetchVenues]));
  const handleRefresh = useCallback(async () => { setRefreshing(true); await fetchVenues(); setRefreshing(false); }, [fetchVenues]);

  const rows = useMemo(() => {
    const venueIds = [...new Set(
      venueAssignments.filter((a) => a.artistId === currentUser?.id && a.status === 'active').map((a) => a.venueId)
    )];
    const venues = venueIds
      .map((id) => allVenues.find((v) => v.id === id))
      .filter((v): v is NonNullable<typeof v> => !!v && !v.isHidden);
    // A gig is invoiceable when completed and not already in a non-cancelled invoice for the venue.
    const invoiceable = allBookings.filter((b) => b.artistId === currentUser?.id && b.isCompleted && b.status === 'completed');
    return venues.map((venue) => {
      const invoicedIds = new Set(
        invoices
          .filter((inv) => inv.venueId === venue.id && inv.artistId === currentUser?.id && inv.status !== 'cancelled')
          .flatMap((inv) => inv.gigs.map((g) => g.bookingId))
      );
      const uninvoiced = invoiceable.filter((b) => b.venueId === venue.id && !invoicedIds.has(b.id)).length;
      return { venue, uninvoiced };
    }).sort((a, b) => (a.venue.name ?? '').toLowerCase().localeCompare((b.venue.name ?? '').toLowerCase()));
  }, [venueAssignments, allVenues, allBookings, invoices, currentUser?.id]);

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Venues</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{rows.length} venue{rows.length === 1 ? '' : 's'}</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.venue.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={roleSwitching ? undefined : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <Divider full />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="storefront" size={44} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>{ROSTER_HINT}</Text>
          </View>
        }
        ListFooterComponent={rows.length > 0
          ? <Text style={[styles.footerText, { color: colors.muted }]}>{ROSTER_HINT}</Text>
          : null}
        renderItem={({ item }) => {
          const hasUninvoiced = item.uninvoiced > 0;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.push(('/(artist)/venue-detail?id=' + item.venue.id) as Href)}
            >
              <Image source={venueImage(item.venue.venueType)} style={[styles.thumb, { borderColor: colors.border }]} resizeMode="cover" />
              <View style={styles.info}>
                <Text style={[styles.venueName, { color: colors.foreground }]} numberOfLines={1}>{item.venue.name}</Text>
                <Text style={[styles.sub, { color: hasUninvoiced ? colors.primary : colors.muted }]} numberOfLines={1}>
                  {hasUninvoiced ? `${item.uninvoiced} gig${item.uninvoiced === 1 ? '' : 's'} to invoice` : 'Up to date'}
                </Text>
              </View>
              {/* Uninvoiced → coral, opens the send-invoice flow. None → grey, opens sent invoices. */}
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [styles.invoiceBtn, { backgroundColor: hasUninvoiced ? colors.primary + '1A' : colors.surface, opacity: pressed ? 0.6 : 1 }]}
                onPress={() => router.push((hasUninvoiced
                  ? `/(artist)/invoice-gigs?venueId=${item.venue.id}`
                  : `/(artist)/venue-detail?id=${item.venue.id}&tab=invoices`) as Href)}
              >
                <MaterialIcons name="description" size={22} color={hasUninvoiced ? colors.primary : colors.muted} />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Sizing mirrors the manager Roster tab (app/(manager)/(tabs)/network.tsx).
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  count: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: 14, borderWidth: 1 },
  info: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: '700', marginBottom: 1 },
  sub: { fontSize: 13, fontWeight: '600' },
  invoiceBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  footerText: { fontSize: 13, lineHeight: 20, marginTop: 18 },
});
