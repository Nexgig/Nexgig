import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Venue, Slot, Booking } from '@/lib/types';
import { useVenueStore, useSlotStore, useBookingStore, useLineupStore } from '@/lib/store';

export default function ManagerLayout() {

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ Fetch venues from Supabase
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .eq('manager_id', user.id)
        .eq('is_hidden', false);

      if (!venuesError && venuesData) {
        const store = useVenueStore.getState();
        store.clearVenues();
        venuesData.forEach((v) => {
          const venue: Venue = {
            id: v.id,
            managerId: v.manager_id,
            name: v.name,
            venueType: v.venue_type,
            googleMapsLocation: { lat: v.lat ?? 0, lng: v.lng ?? 0, address: v.address ?? '' },
            capacity: v.capacity ?? undefined,
            vibeDescription: v.vibe_description ?? undefined,
            preferredEnergy: Array.isArray(v.preferred_energy) ? v.preferred_energy : [],
            genrePreferences: Array.isArray(v.genre_preferences) ? v.genre_preferences : [],
            audienceType: Array.isArray(v.audience_type) ? v.audience_type : [],
            subVibe: Array.isArray(v.sub_vibe) ? v.sub_vibe : [],
            rulesTemplate: v.rules_template ?? undefined,
            instagramUrl: v.instagram_url ?? undefined,
            musicLink: v.music_link ?? undefined,
            color: v.color ?? '#2563EB',
            billing: v.billing_company_name ? {
              companyName: v.billing_company_name,
              companyAddress: v.billing_company_address,
              trnNumber: v.billing_trn_number,
            } : undefined,
            photoUrls: [],
            isHidden: v.is_hidden ?? false,
            isComplete: true,
            hasCompletedBooking: false,
            createdAt: v.created_at,
            updatedAt: v.updated_at,
          };
          store.addVenue(venue);
        });
      }

      // ✅ Fetch slots from Supabase
      const { data: slotsData, error: slotsError } = await supabase
        .from('slots')
        .select('*')
        .eq('manager_id', user.id);

      if (!slotsError && slotsData) {
        const slotStore = useSlotStore.getState();
        slotStore.clearSlots();
        slotsData.forEach((s) => {
          const slot: Slot = {
            id: s.id,
            venueId: s.venue_id,
            name: s.name,
            date: s.date,
            startTime: s.start_time,
            endTime: s.end_time,
            createdAt: s.created_at,
          };
          slotStore.addSlot(slot);
        });
      }

      // ✅ Fetch bookings from Supabase
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('manager_id', user.id);

      if (!bookingsError && bookingsData) {
        const bookingStore = useBookingStore.getState();
        bookingStore.clearBookings();
        bookingsData.forEach((b) => {
          const booking: Booking = {
            id: b.id,
            slotId: b.slot_id,
            venueId: b.venue_id,
            artistId: b.artist_id,
            managerId: b.manager_id,
            status: b.status,
            isCompleted: b.is_completed ?? false,
            confirmedAt: b.confirmed_at ?? undefined,
            cancelledAt: b.cancelled_at ?? undefined,
            cancellationReason: b.cancellation_reason ?? undefined,
            cancellationAcknowledged: b.cancellation_acknowledged ?? false,
            cancelledAsRequest: b.cancelled_as_request ?? false,
            hiddenFromCalendar: b.hidden_from_calendar ?? false,
            hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
            slotDate: b.slot_date ?? undefined,
            slotName: b.slot_name ?? undefined,
            slotStartTime: b.slot_start_time ?? undefined,
            slotEndTime: b.slot_end_time ?? undefined,
            venueName: b.venue_name ?? undefined,
            createdAt: b.created_at,
            updatedAt: b.updated_at,
          };
          bookingStore.addBooking(booking);
        });
      }

      // ✅ Fetch global lineup from Supabase
      const { data: lineupData, error: lineupError } = await supabase
        .from('global_lineup')
        .select('artist_id, created_at')
        .eq('manager_id', user.id)
        .eq('status', 'active');

      const lineupStore = useLineupStore.getState();
lineupStore.clearGlobalLineup();
lineupStore.clearArtistUsers();

if (!lineupError && lineupData) {
  const artistIds = lineupData.map((l) => l.artist_id);
        if (artistIds.length > 0) {
          const { data: artistsData } = await supabase
            .from('artists')
            .select('id, full_name, email, primary_genre, secondary_genres, instruments, based_in, profile_photo_url, instagram_url, soundcloud_url, bio, min_rate, years_of_experience')
            .in('id', artistIds);

          if (artistsData) {
            artistsData.forEach((a) => {
              lineupStore.addArtistUser({
                id: a.id,
                email: a.email ?? '',
                phone: '',
                accountType: 'artist' as const,
                fullName: a.full_name,
                username: undefined,
                profilePhotoUrl: a.profile_photo_url ?? undefined,
                location: a.based_in ?? undefined,
                isPhoneVerified: false,
                isEmailVerified: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              lineupStore.addToGlobalLineup({
                id: `${user.id}-${a.id}`,
                managerId: user.id,
                artistId: a.id,
                status: 'active' as const,
                addedAt: new Date().toISOString(),
              });
            });
          }
        }

        // ✅ Fetch venue assignments from Supabase
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('venue_assignments')
          .select('id, artist_id, venue_id, manager_id, created_at')
          .eq('manager_id', user.id)
          .eq('status', 'active');

        if (!assignmentsError && assignmentsData) {
          const lineupStore2 = useLineupStore.getState();
          assignmentsData.forEach((a) => {
            lineupStore2.assignToVenue({
              id: a.id,
              globalLineupId: `${user.id}-${a.artist_id}`,
              venueId: a.venue_id,
              artistId: a.artist_id,
              assignedAt: a.created_at,
              status: 'active' as const,
            });
          });
        }
      }
    };

    fetchData();

    // ✅ Realtime: listen for booking status changes
    const subscription = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload) => {
  const b = payload.new as any;
  const bookingStore = useBookingStore.getState();
  bookingStore.updateBookingStatus(b.id, b.status, {
            confirmedAt: b.confirmed_at ?? undefined,
            cancelledAt: b.cancelled_at ?? undefined,
            cancellationReason: b.cancellation_reason ?? undefined,
            cancellationAcknowledged: b.cancellation_acknowledged ?? false,
            cancelledAsRequest: b.cancelled_as_request ?? false,
            isCompleted: b.is_completed ?? false,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="venue-detail" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="assign-artist" />
      <Stack.Screen name="create-venue" />
      <Stack.Screen name="invite-artist" />
      <Stack.Screen name="artist-profile-view" />
      <Stack.Screen name="artist-bookings" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="pending-requests" />
      <Stack.Screen name="confirmed-bookings" />
      <Stack.Screen name="my-venues" />
      <Stack.Screen name="artists" />
      <Stack.Screen name="completed-gigs" />
      <Stack.Screen name="discovery" />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="edit-venue" options={{ gestureEnabled: false }} />
      <Stack.Screen name="manager-artist-invoices" />
      <Stack.Screen name="manager-invoice-detail" />
      <Stack.Screen name="settings" />
      <Stack.Screen
        name="send-feedback"
        options={{
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}