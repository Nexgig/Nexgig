import { supabase } from './supabase';

// ─── Venues ─────────────────────────────────────────────────────────────────

export async function getVenues(managerId: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVenue(venue: {
  managerId: string;
  name: string;
  legalName?: string;
  venueType?: string;
  address?: string;
  trnNumber?: string;
  city?: string;
  country?: string;
  color?: string;
  genres?: string[];
  audienceType?: string[];
  subVibe?: string[];
  preferredEnergy?: string;
  instagramUrl?: string;
  musicLink?: string;
}) {
  const { data, error } = await supabase
    .from('venues')
    .insert({
      manager_id: venue.managerId,
      name: venue.name,
      legal_name: venue.legalName,
      venue_type: venue.venueType,
      address: venue.address,
      trn_number: venue.trnNumber,
      city: venue.city,
      country: venue.country,
      color: venue.color,
      genres: venue.genres,
      audience_type: venue.audienceType,
      sub_vibe: venue.subVibe,
      preferred_energy: venue.preferredEnergy,
      instagram_url: venue.instagramUrl,
      music_link: venue.musicLink,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVenue(venueId: string, updates: Partial<{
  name: string;
  legalName: string;
  venueType: string;
  address: string;
  trnNumber: string;
  city: string;
  color: string;
  genres: string[];
  audienceType: string[];
  subVibe: string[];
  preferredEnergy: string;
  instagramUrl: string;
  musicLink: string;
  invoiceDueDay: number;
}>) {
  const { data, error } = await supabase
    .from('venues')
    .update({
      name: updates.name,
      legal_name: updates.legalName,
      venue_type: updates.venueType,
      address: updates.address,
      trn_number: updates.trnNumber,
      city: updates.city,
      color: updates.color,
      genres: updates.genres,
      audience_type: updates.audienceType,
      sub_vibe: updates.subVibe,
      preferred_energy: updates.preferredEnergy,
      instagram_url: updates.instagramUrl,
      music_link: updates.musicLink,
      invoice_due_day: updates.invoiceDueDay,
      updated_at: new Date().toISOString(),
    })
    .eq('id', venueId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVenue(venueId: string) {
  const { error } = await supabase.from('venues').delete().eq('id', venueId);
  if (error) throw error;
}

// ─── Slots ───────────────────────────────────────────────────────────────────

export async function getSlots(venueId: string) {
  const { data, error } = await supabase
    .from('slots')
    .select('*')
    .eq('venue_id', venueId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createSlot(slot: {
  venueId: string;
  managerId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
}) {
  const { data, error } = await supabase
    .from('slots')
    .insert({
      venue_id: slot.venueId,
      manager_id: slot.managerId,
      name: slot.name,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSlot(slotId: string, updates: Partial<{
  name: string;
  startTime: string;
  endTime: string;
}>) {
  const { data, error } = await supabase
    .from('slots')
    .update({
      name: updates.name,
      start_time: updates.startTime,
      end_time: updates.endTime,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSlot(slotId: string) {
  const { error } = await supabase.from('slots').delete().eq('id', slotId);
  if (error) throw error;
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export async function getBookingsForManager(managerId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getBookingsForArtist(artistId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createBooking(booking: {
  slotId: string;
  venueId: string;
  managerId: string;
  artistId: string;
  slotDate: string;
  slotName: string;
  slotStartTime: string;
  slotEndTime: string;
  venueName: string;
}) {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      slot_id: booking.slotId,
      venue_id: booking.venueId,
      manager_id: booking.managerId,
      artist_id: booking.artistId,
      status: 'requested',
      slot_date: booking.slotDate,
      slot_name: booking.slotName,
      slot_start_time: booking.slotStartTime,
      slot_end_time: booking.slotEndTime,
      venue_name: booking.venueName,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'declined' | 'cancelled' | 'completed',
  extra?: { confirmedAt?: string; cancelledAt?: string; cancellationReason?: string; isCompleted?: boolean }
) {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status,
      confirmed_at: extra?.confirmedAt,
      cancelled_at: extra?.cancelledAt,
      cancellation_reason: extra?.cancellationReason,
      is_completed: extra?.isCompleted,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Lineup ──────────────────────────────────────────────────────────────────

export async function getLineup(managerId: string) {
  const { data, error } = await supabase
    .from('global_lineup')
    .select('*, artist:users!artist_id(*)')
    .eq('manager_id', managerId)
    .eq('status', 'active');
  if (error) throw error;
  return data;
}

export async function addToLineup(managerId: string, artistId: string) {
  const { data, error } = await supabase
    .from('global_lineup')
    .insert({ manager_id: managerId, artist_id: artistId, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromLineup(managerId: string, artistId: string) {
  const { error } = await supabase
    .from('global_lineup')
    .delete()
    .eq('manager_id', managerId)
    .eq('artist_id', artistId);
  if (error) throw error;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNotification(notification: {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
}) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      related_id: notification.relatedId,
      related_type: notification.relatedType,
      is_read: false,
    });
  if (error) throw error;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(userId: string, updates: {
  fullName?: string;
  bio?: string;
  basedIn?: string;
  nationality?: string;
  gender?: string;
  primaryGenre?: string;
  secondaryGenres?: string[];
  instruments?: string[];
  minRate?: number;
  instagramUrl?: string;
  soundcloudUrl?: string;
  spotifyUrl?: string;
  profilePhotoUrl?: string;
}) {
  const { data, error } = await supabase
    .from('users')
    .update({
      full_name: updates.fullName,
      bio: updates.bio,
      based_in: updates.basedIn,
      nationality: updates.nationality,
      gender: updates.gender,
      primary_genre: updates.primaryGenre,
      secondary_genres: updates.secondaryGenres,
      instruments: updates.instruments,
      min_rate: updates.minRate,
      instagram_url: updates.instagramUrl,
      soundcloud_url: updates.soundcloudUrl,
      spotify_url: updates.spotifyUrl,
      profile_photo_url: updates.profilePhotoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function searchArtists(query: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('account_type', 'artist')
    .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
    .limit(20);
  if (error) throw error;
  return data;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export async function createInvite(invite: {
  managerId: string;
  email: string;
  venueIds?: string[];
}) {
  const { data, error } = await supabase
    .from('invites')
    .insert({
      manager_id: invite.managerId,
      email: invite.email,
      venue_ids: invite.venueIds ?? [],
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInviteVenues(email: string, managerId: string, venueIds: string[]) {
  const { error } = await supabase
    .from('invites')
    .update({ venue_ids: venueIds, updated_at: new Date().toISOString() })
    .eq('email', email)
    .eq('manager_id', managerId);
  if (error) throw error;
}