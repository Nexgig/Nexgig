import { supabase } from './supabase';
import { reportError, reportWarning } from './observability';
import type { BookingReview } from './types';

/**
 * Reviews live in the `reviews` table. The local store (`useReviewStore`) is a CACHE of it,
 * not the record — it used to be the only home, which meant a review never left the artist's
 * phone and the manager's booking-detail always read "No review yet" even though the
 * notification arrived. This module is the single source of truth for the round trip; any new
 * screen that shows a review must load it through here rather than trusting the local store.
 *
 * RLS: the artist inserts and reads their own row; the gig's manager reads it. There is no
 * update or delete policy — a submitted review is immutable, which matches the copy the artist
 * agrees to ("this can't be changed later").
 */

function toReview(r: any): BookingReview {
  return {
    id: r.id,
    bookingId: r.booking_id,
    artistId: r.artist_id,
    rating: r.rating,
    text: r.text ?? undefined,
    createdAt: r.created_at,
  };
}

/**
 * Write a review. Returns the stored row (DB-generated id and timestamp) so the caller can
 * cache the real record rather than a locally-invented one, or null if the write failed.
 *
 * `booking_id` is unique, so a double submit hits a constraint violation instead of creating a
 * second review — reported, not thrown, since the artist has already seen a success state.
 */
export async function submitReview(params: {
  bookingId: string;
  artistId: string;
  managerId: string;
  rating: number;
  text?: string;
}): Promise<BookingReview | null> {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: params.bookingId,
      artist_id: params.artistId,
      manager_id: params.managerId,
      rating: params.rating,
      text: params.text ?? null,
    })
    .select('id, booking_id, artist_id, rating, text, created_at')
    .single();

  if (error || !data) {
    reportError(error ?? new Error('submitReview returned no row'), {
      bookingId: params.bookingId,
      artistId: params.artistId,
    });
    return null;
  }
  return toReview(data);
}

/**
 * Load every review visible to this user. RLS decides which rows come back, so the same call
 * works for both sides: an artist gets their own reviews, a manager gets the reviews left on
 * their gigs. Returns [] on failure — a missing review renders as "No review yet", which is
 * the same thing the screen shows before the fetch resolves.
 */
export async function fetchReviews(): Promise<BookingReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, booking_id, artist_id, rating, text, created_at');

  if (error) {
    reportWarning('fetchReviews failed', { message: error.message });
    return [];
  }
  return (data ?? []).map(toReview);
}
