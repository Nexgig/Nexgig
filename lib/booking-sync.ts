import { supabase } from './supabase';
import type { BookingStatus } from './types';
import { reportWarning } from './observability';

export async function syncBookingStatus(
  bookingId: string,
  status: BookingStatus,
  extra: Record<string, any> = {}
) {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'confirmed' || extra.confirmedAt) {
    updates.confirmed_at = extra.confirmedAt ?? new Date().toISOString();
  }
  if (status === 'cancelled' || extra.cancelledAt) {
    updates.cancelled_at = extra.cancelledAt ?? new Date().toISOString();
  }
  if (extra.cancellationReason) {
    updates.cancellation_reason = extra.cancellationReason;
  }
  if (extra.cancellationAcknowledged !== undefined) {
    updates.cancellation_acknowledged = extra.cancellationAcknowledged;
  }
  if (extra.cancelledAsRequest !== undefined) {
    updates.cancelled_as_request = extra.cancelledAsRequest;
  }
  if (extra.cancelledByArtist !== undefined) {
    updates.cancelled_by_artist = extra.cancelledByArtist;
  }
  if (extra.isCompleted !== undefined) {
    updates.is_completed = extra.isCompleted;
  }
  if (extra.hiddenFromCalendar !== undefined) {
    updates.hidden_from_calendar = extra.hiddenFromCalendar;
  }
  if (extra.hiddenFromManagerCalendar !== undefined) {
    updates.hidden_from_manager_calendar = extra.hiddenFromManagerCalendar;
  }
  if (extra.slotDate !== undefined) updates.slot_date = extra.slotDate;
  if (extra.slotName !== undefined) updates.slot_name = extra.slotName;
  if (extra.slotStartTime !== undefined) updates.slot_start_time = extra.slotStartTime;
  if (extra.slotEndTime !== undefined) updates.slot_end_time = extra.slotEndTime;
  if (extra.venueName !== undefined) updates.venue_name = extra.venueName;
  if (extra.price !== undefined) updates.price = extra.price;

  // `.select('id')` returns the affected rows so we can tell a genuine success from a
  // silent 0-row write (e.g. blocked by RLS, or the row doesn't exist) — the exact
  // class of failure that let a cancel "succeed" locally while the DB never changed.
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select('id');

  if (error) {
    console.warn('Failed to sync booking status:', error.message);
    reportWarning('booking write failed', { bookingId, status, error: error.message });
  } else if (!data || data.length === 0) {
    console.warn('Booking status write affected 0 rows:', bookingId);
    reportWarning('booking write affected 0 rows', { bookingId, status });
  }
}