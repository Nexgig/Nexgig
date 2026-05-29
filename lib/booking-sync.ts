import { supabase } from './supabase';
import type { BookingStatus } from './types';

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

  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId);
    console.log('syncBookingStatus:', bookingId, status, error?.message ?? 'success');

  if (error) {
    console.warn('Failed to sync booking status:', error.message);
  }
}