import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useVenueStore, useSlotStore } from '@/lib/store';
import type { Venue, Slot } from '@/lib/types';

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
    };

    fetchData();
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