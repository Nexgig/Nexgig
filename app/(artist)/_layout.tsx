import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useBookingStore, useAuthStore } from '@/lib/store';
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
      <Stack.Screen name="discovery" />
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
