import { supabase } from './supabase';
import { useVenueStore } from './store';
import { useSlotStore } from './store';
import { useBookingStore } from './store';
import { useLineupStore } from './store';
import { useNotificationStore } from './store';
import type { Venue, Slot, Booking, AppNotification } from './types';

// ─── Load all data for a user from Supabase into Zustand stores ──────────────

export async function syncUserData(userId: string, accountType: 'manager' | 'artist') {
  try {
    if (accountType === 'manager') {
      // Fetch everything in parallel, then apply ALL stores together in one
      // synchronous block. React batches the setStates into a single re-render,
      // so the UI goes straight from cached data to fully-fresh data with no
      // in-between frame where (e.g.) bookings are fresh but venues aren't yet —
      // which previously showed "Unknown Venue" for a fraction of a second.
      const [venues, bookings, slots, notifications] = await Promise.all([
        fetchVenues(userId),
        fetchManagerBookings(userId),
        fetchManagerSlots(userId),
        fetchNotifications(userId),
      ]);
      if (venues) useVenueStore.setState({ venues });
      if (slots) useSlotStore.setState({ slots });
      if (bookings) useBookingStore.setState({ bookings });
      if (notifications) useNotificationStore.setState({ notifications });
    } else {
      const [bookings, notifications] = await Promise.all([
        fetchArtistBookings(userId),
        fetchNotifications(userId),
      ]);
      if (bookings) useBookingStore.setState({ bookings });
      if (notifications) useNotificationStore.setState({ notifications });
    }
  } catch (error) {
    console.warn('Sync error:', error);
  }
}

// ─── Sync venues ─────────────────────────────────────────────────────────────

async function fetchVenues(managerId: string): Promise<Venue[] | null> {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  const venues: Venue[] = data.map((v) => ({
    id: v.id,
    managerId: v.manager_id,
    name: v.name,
    venueType: v.venue_type ?? 'Lounge',
    googleMapsLocation: { lat: v.lat ?? 0, lng: v.lng ?? 0, address: v.address ?? '', placeId: v.place_id ?? undefined },
    capacity: v.capacity ?? undefined,
    rulesTemplate: v.rules_template ?? undefined,
    preferredEnergy: v.preferred_energy ?? [],
    genrePreferences: v.genres ?? [],
    vibeDescription: v.vibe_description ?? undefined,
    instagramUrl: v.instagram_url ?? undefined,
    musicLink: v.music_link ?? undefined,
    audienceType: v.audience_type ?? [],
    subVibe: v.sub_vibe ?? [],
    billing: v.billing ?? undefined,
    schedule: v.schedule ?? undefined,
    color: v.color ?? '#2563EB',
    isHidden: v.is_hidden ?? false,
    isComplete: v.is_complete ?? false,
    verificationStatus: v.verification_status ?? 'pending',
    hasCompletedBooking: v.has_completed_booking ?? undefined,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  }));

  return venues;
}

// ─── Sync slots ──────────────────────────────────────────────────────────────

async function fetchManagerSlots(managerId: string): Promise<Slot[] | null> {
  const { data, error } = await supabase
    .from('slots')
    .select('*')
    .eq('manager_id', managerId)
    .order('date', { ascending: true });

  if (error || !data) return null;

  const slots: Slot[] = data.map((s) => ({
    id: s.id,
    venueId: s.venue_id,
    managerId: s.manager_id,
    name: s.name,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    status: s.status,
    scheduleGenerated: s.schedule_generated ?? false,
    defaultPrice: s.default_price ?? undefined,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return slots;
}

// ─── Sync bookings for manager ───────────────────────────────────────────────

async function fetchManagerBookings(managerId: string): Promise<Booking[] | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  const bookings: Booking[] = data.map(mapBooking);
  return bookings;
}

// ─── Sync bookings for artist ────────────────────────────────────────────────

async function fetchArtistBookings(artistId: string): Promise<Booking[] | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  const bookings: Booking[] = data.map(mapBooking);
  return bookings;
}

// ─── Sync notifications ──────────────────────────────────────────────────────

async function fetchNotifications(userId: string): Promise<AppNotification[] | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return null;

  const notifications: AppNotification[] = data.map((n) => ({
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.is_read,
    relatedId: n.related_id ?? undefined,
    relatedType: n.related_type ?? undefined,
    createdAt: n.created_at,
  }));

  return notifications;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function mapBooking(b: any): Booking {
  return {
    id: b.id,
    slotId: b.slot_id ?? undefined,
    venueId: b.venue_id ?? undefined,
    managerId: b.manager_id,
    artistId: b.artist_id,
    status: b.status,
    slotDate: b.slot_date ?? undefined,
    slotName: b.slot_name ?? undefined,
    slotStartTime: b.slot_start_time ?? undefined,
    slotEndTime: b.slot_end_time ?? undefined,
    price: b.price ?? undefined,
    venueName: b.venue_name ?? undefined,
    isCompleted: b.is_completed ?? false,
    isArtistCreated: b.is_artist_created ?? false,
    confirmedAt: b.confirmed_at ?? undefined,
    cancelledAt: b.cancelled_at ?? undefined,
    cancellationReason: b.cancellation_reason ?? undefined,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

// ─── Real-time notifications ─────────────────────────────────────────────────

export function subscribeToNotifications(userId: string) {
  return supabase
    .channel('notifications')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      const n = payload.new as any;
      useNotificationStore.getState().addNotification({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.is_read,
        relatedId: n.related_id ?? undefined,
        relatedType: n.related_type ?? undefined,
        createdAt: n.created_at,
      });
    })
    .subscribe();
}