import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useBookingStore, useAuthStore, useNotificationStore, useLineupStore, useVenueStore, useAvailabilityStore, useInvoiceStore } from '@/lib/store';
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
          } else if (!booking.isCompleted || booking.status !== 'completed') {
            bookingStore.addBooking(booking);
          }
        });
      }
    };
    fetchBookings();

    // Fetch pending invites and show as notifications
    const fetchInvites = async () => {
      const { data } = await supabase
        .from('invites')
        .select('id, manager_id, venue_ids, created_at')
        .eq('artist_id', currentUser.id)
        .eq('status', 'pending');
      if (!data || data.length === 0) return;

      // Fetch manager names
      const managerIds = [...new Set(data.map((i: any) => i.manager_id))];
      const { data: managers } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', managerIds);
      const managerMap = Object.fromEntries((managers ?? []).map((m: any) => [m.id, m.full_name]));

      const notifStore = useNotificationStore.getState();
      data.forEach((invite: any) => {
        const existingNotif = notifStore.notifications.find(
          (n) => n.relatedId === invite.id && n.type === 'manager_invite'
        );
        if (existingNotif) return; // already in store
        const managerName = managerMap[invite.manager_id] ?? 'A manager';
        const venueCount = (invite.venue_ids ?? []).length;
        notifStore.addNotification({
          id: `invite-${invite.id}`,
          userId: currentUser.id,
          type: 'manager_invite',
          title: 'Lineup Invitation',
          body: `${managerName} invited you to join their lineup${venueCount > 0 ? ` · ${venueCount} venue${venueCount > 1 ? 's' : ''}` : ''}.`,
          isRead: false,
          relatedId: invite.id,
          relatedType: 'invite',
          createdAt: invite.created_at,
        });
      });
    };
    fetchInvites();

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
              venueType: v.venue_type, description: v.description,
              photoUrls: v.photo_urls ?? [],
              genrePreferences: v.genre_preferences ?? [],
              energyPreferences: v.energy_preferences ?? [],
              googleMapsLocation: v.google_maps_location,
              isHidden: v.is_hidden ?? false,
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
    fetchInvoices();
  }, [currentUser?.id]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="edit-profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="requests" />
      <Stack.Screen name="confirmed-gigs" />
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
