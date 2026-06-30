import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useBookingStore, useAuthStore, useNotificationStore, useLineupStore, useVenueStore, useAvailabilityStore, useInvoiceStore, loadNotificationsFromSupabase } from '@/lib/store';
import { rescheduleArtistReminders } from '@/lib/reminders';
import { rescheduleInvoiceReminders } from '@/lib/invoice-reminders';
import type { Booking } from '@/lib/types';

export default function DJLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => {
    if (!currentUser?.id) return;

    const fetchBookings = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', currentUser.id)
        .or('cancelled_as_request.is.null,cancelled_as_request.eq.false');
      if (!error && data) {
        const bookingStore = useBookingStore.getState();
        data.forEach((b) => {
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
          // Only update existing bookings, don't wipe artist-created private events
          const existing = bookingStore.bookings.find((bk) => bk.id === booking.id);
          if (existing) {
            bookingStore.updateBookingStatus(booking.id, booking.status, {
              confirmedAt: booking.confirmedAt,
              cancelledAt: booking.cancelledAt,
              isCompleted: booking.isCompleted,
            });
          } else {
            // Add everything that isn't already in the store — INCLUDING completed gigs.
            // (Private events live in availability_blocks, not here, so they're untouched.)
            // Previously completed bookings were skipped, so after sign-out/in they vanished
            // from the dashboard COMPLETED count, Completed Gigs, and History.
            bookingStore.addBooking(booking);
          }
        });
      }
    };
    fetchBookings().then(() => {
      // Schedule local gig reminders from the freshly-loaded confirmed bookings
      // + the artist's saved reminder offsets. Safe to call repeatedly.
      rescheduleArtistReminders(currentUser.id);
    });

    // Fetch venue assignments so artist sees their venues after reload
    const fetchVenueAssignments = async () => {
      const { data: assignments } = await supabase
        .from('venue_assignments')
        .select('*')
        .eq('artist_id', currentUser.id)
        .eq('status', 'active');
      if (!assignments || assignments.length === 0) return;

      const lineupStore = useLineupStore.getState();
      const venueStore = useVenueStore.getState();

      // Fetch venue data for any venues not already in store
      const knownVenueIds = new Set(venueStore.venues.map((v) => v.id));
      const missingIds = assignments
        .map((a: any) => a.venue_id)
        .filter((id: string) => !knownVenueIds.has(id));

      if (missingIds.length > 0) {
        const { data: venuesData } = await supabase
          .from('venues')
          .select('*')
          .in('id', missingIds);
        if (venuesData) {
          venuesData.forEach((v: any) => {
            venueStore.addVenue({
              id: v.id, managerId: v.manager_id, name: v.name,
              venueType: v.venue_type,
              photoUrls: Array.isArray(v.photo_urls) ? v.photo_urls : [],
              genrePreferences: Array.isArray(v.genre_preferences) ? v.genre_preferences : [],
              preferredEnergy: Array.isArray(v.preferred_energy) ? v.preferred_energy : [],
              audienceType: Array.isArray(v.audience_type) ? v.audience_type : [],
              subVibe: Array.isArray(v.sub_vibe) ? v.sub_vibe : [],
              vibeDescription: v.vibe_description ?? undefined,
              rulesTemplate: v.rules_template ?? undefined,
              instagramUrl: v.instagram_url ?? undefined,
              musicLink: v.music_link ?? undefined,
              capacity: v.capacity ?? undefined,
              googleMapsLocation: v.google_maps_location ?? { lat: v.lat ?? 0, lng: v.lng ?? 0, address: v.address ?? '' },
              color: v.color ?? '#2563EB',
              isHidden: v.is_hidden ?? false,
              isComplete: v.is_complete ?? false,
              createdAt: v.created_at, updatedAt: v.updated_at,
            });
          });
        }
      }

      // Reset artist's venue assignments with fresh data from Supabase
      const freshAssignments = assignments.map((a: any) => ({
        id: a.id,
        globalLineupId: `${a.manager_id}-${currentUser.id}`,
        venueId: a.venue_id,
        artistId: currentUser.id,
        assignedAt: a.created_at,
        status: 'active' as const,
      }));
      lineupStore.resetVenueAssignmentsForArtist(currentUser.id, freshAssignments);
    };
    fetchVenueAssignments();

    // Load availability blocks from Supabase (blocks + private events)
    const fetchBlocks = async () => {
      const { data } = await supabase
        .from('availability_blocks')
        .select('id, date, start_time, end_time, is_full_day, block_type, event_name, location')
        .eq('artist_id', currentUser.id);
      if (!data || data.length === 0) {
        // Clear any stale persisted blocks for this artist
        useAvailabilityStore.getState().resetBlocksForArtist(currentUser.id, []);
        return;
      }
      const freshBlocks = data.map((b: any) => ({
        id: b.id,
        artistId: currentUser.id,
        date: b.date,
        startTime: b.start_time,
        endTime: b.end_time,
        fullDay: b.is_full_day ?? false,
        label: b.block_type === 'private_event' ? 'Private Event' : 'Unavailable',
        blockType: b.block_type ?? 'block',
        createdAt: new Date().toISOString(),
      }));
      useAvailabilityStore.getState().resetBlocksForArtist(currentUser.id, freshBlocks);
    };
    fetchBlocks();

    // Load artist's sent invoices from Supabase
    const fetchInvoices = async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('artist_id', currentUser.id)
        .order('sent_at', { ascending: false });
      if (!data || data.length === 0) return;
      const invoiceStore = useInvoiceStore.getState();
      data.forEach((inv: any) => {
        // Only add if not already in store
        if (invoiceStore.invoices.some((i) => i.id === inv.id)) return;
        invoiceStore.addInvoice({
          id: inv.id,
          venueId: inv.venue_id,
          venueName: inv.venue_name,
          artistId: inv.artist_id,
          artistLegalName: inv.artist_legal_name,
          artistEmail: inv.artist_email ?? '',
          artistLocation: inv.artist_location ?? '',
          managerId: inv.manager_id,
          managerName: inv.manager_name ?? '',
          venueLegalName: inv.venue_legal_name ?? inv.venue_name,
          venueTrnNumber: inv.venue_trn_number ?? '',
          venueAddress: inv.venue_address ?? '',
          gigs: inv.gigs ?? [],
          totalAmount: parseFloat(inv.total_amount),
          invoiceNumber: inv.invoice_number ?? '',
          sentAt: inv.sent_at,
          status: inv.status,
        });
      });
    };
    fetchInvoices().then(() => {
      // Schedule local invoice reminders once bookings (completed gigs) + invoices
      // (sent-this-month check) are loaded. Safe to call repeatedly.
      rescheduleInvoiceReminders(currentUser.id);
    });

    // Load notifications from Supabase
    loadNotificationsFromSupabase(currentUser.id);
    // Remove any stale channels from previous renders/hot-reloads
    supabase.getChannels()
      .filter((c: any) => c.topic?.includes(currentUser.id))
      .forEach((c: any) => supabase.removeChannel(c));

    // Realtime: receive new notifications instantly
    let notifCancelled = false;
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;
    const notifTimer = setTimeout(() => {
      if (notifCancelled) return;
      notifChannel = supabase
        .channel(`notif-artist-${currentUser.id}-${Date.now()}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        (payload) => {
          const n = payload.new as any;
          const store = useNotificationStore.getState();
          if (store.notifications.some((x) => x.id === n.id)) return;
          // If removed from a venue, update local venue assignments immediately
          if (n.type === 'venue_removed' && n.related_id) {
            const lineupStore = useLineupStore.getState();
            lineupStore.resetVenueAssignmentsForArtist(
              currentUser.id,
              lineupStore.venueAssignments.filter(
                (a) => !(a.artistId === currentUser.id && a.venueId === n.related_id)
              )
            );
          }
          useNotificationStore.setState((state) => ({
            notifications: [{
              id: n.id, userId: n.user_id, type: n.type,
              title: n.title, body: n.body, isRead: n.is_read ?? false,
              relatedId: n.related_id ?? undefined, relatedType: n.related_type ?? undefined,
              createdAt: n.created_at,
            }, ...state.notifications],
          }));
          // Re-sync local gig reminders whenever a booking changes status under us.
          // A cancelled/declined gig must drop its already-scheduled "gig in X hours"
          // reminder (otherwise it still fires); a newly confirmed/requested gig should
          // get its reminder without waiting for the next cold start.
          //
          // There is NO realtime subscription on the bookings table, so the local store
          // still shows the OLD status when this notification arrives. rescheduleArtistReminders
          // reads getConfirmedBookingsByDJ() from the local store, so we must first re-fetch
          // the one affected booking from Supabase and apply it locally — otherwise a cancelled
          // gig would still look confirmed and its reminder would be re-scheduled.
          if (
            (n.type === 'booking_cancelled' ||
              n.type === 'booking_request_cancelled' ||
              n.type === 'booking_confirmed' ||
              n.type === 'booking_request') &&
            n.related_id && n.related_type === 'booking'
          ) {
            (async () => {
              const { data: b } = await supabase
                .from('bookings')
                .select('*')
                .eq('id', n.related_id)
                .maybeSingle();
              if (b) {
                const bookingStore = useBookingStore.getState();
                const existing = bookingStore.bookings.find((bk) => bk.id === b.id);
                if (existing) {
                  bookingStore.updateBookingStatus(b.id, b.status, {
                    confirmedAt: b.confirmed_at ?? undefined,
                    cancelledAt: b.cancelled_at ?? undefined,
                    isCompleted: b.is_completed ?? false,
                  });
                } else {
                  bookingStore.addBooking({
                    id: b.id, slotId: b.slot_id, venueId: b.venue_id, artistId: b.artist_id,
                    managerId: b.manager_id, status: b.status, isCompleted: b.is_completed ?? false,
                    confirmedAt: b.confirmed_at ?? undefined, cancelledAt: b.cancelled_at ?? undefined,
                    cancellationReason: b.cancellation_reason ?? undefined,
                    cancellationAcknowledged: b.cancellation_acknowledged ?? false,
                    cancelledAsRequest: b.cancelled_as_request ?? false,
                    hiddenFromCalendar: b.hidden_from_calendar ?? false,
                    hiddenFromManagerCalendar: b.hidden_from_manager_calendar ?? false,
                    slotDate: b.slot_date ?? undefined, slotName: b.slot_name ?? undefined,
                    slotStartTime: b.slot_start_time ?? undefined, slotEndTime: b.slot_end_time ?? undefined,
                    venueName: b.venue_name ?? undefined, createdAt: b.created_at, updatedAt: b.updated_at,
                  });
                }
              }
              // Now the store reflects the real status — rebuild reminders from it.
              rescheduleArtistReminders(currentUser.id);
            })();
          }
        }
      )
      .subscribe();
      }, 200);
      return () => { notifCancelled = true; clearTimeout(notifTimer); if (notifChannel) supabase.removeChannel(notifChannel); };
  }, [currentUser?.id]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" options={{ gestureEnabled: false }} />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="confirmed-gigs" />
      <Stack.Screen name="all-bookings" />
      <Stack.Screen name="completed-gigs" />
      <Stack.Screen name="pending-requests" />
      <Stack.Screen name="my-venues" />
      <Stack.Screen name="venue-detail" />
      <Stack.Screen name="artist-profile-view" />
      <Stack.Screen name="invoices" />
      <Stack.Screen name="invoice-gigs" />
      <Stack.Screen name="invoice-preview" />
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
