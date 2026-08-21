// ─── Account Types ────────────────────────────────────────────────────────────

export type AccountType = 'manager' | 'artist';

export type UAECity = 'Dubai' | 'Abu Dhabi' | 'Sharjah' | 'Ajman' | 'Ras Al Khaimah' | 'Fujairah' | 'Umm Al Quwain';

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  phone: string;
  accountType: AccountType;
  fullName: string; // Artist Name (stage name, shown publicly)
  fullLegalName?: string; // Real legal name, stored privately, for future invoicing
  username?: string; // Unique identifier, lowercase/numbers/underscores only, stored privately
  profilePhotoUrl?: string;
  avatarId?: string; // Key of a chosen bundled avatar (e.g. 'avatar-7') when no uploaded photo. See lib/avatars.ts.
  bio?: string;
  location?: string;
  yearsOfExperience?: number;
  companyName?: string; // Manager's company / employer name (replaces years-of-experience for managers)
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── DJ Profile ──────────────────────────────────────────────────────────────

export type Genre = GenreType;
export type VenueGenre = GenreType;
export type VenueEnergy = EnergyType;

export type GenreType =
  | 'House & Electronic'
  | 'Open Format'
  | 'Lounge / Jazzy / Soulful House'
  | 'Arabic'
  | 'After Hours'
  | 'Latin'
  | 'Afro Beats'
  | 'Hip-Hop & R&B'
  | 'Techno'
  | 'Disco & Funk'
  | 'Commercial & Top 40'
  // Venue-specific genres
  | 'House'
  | 'Tech House'
  | 'Afro House'
  | 'Melodic House & Techno'
  | 'Deep House'
  | 'EDM / Commercial'
  | 'Hip Hop / R&B'
  | 'Afrobeats'
  | 'Amapiano'
  | 'Khaleeji'
  | 'Pop / Top 40'
  | 'Reggaeton'
  | 'R&B/Soul'
  | 'Dancehall'
  | 'Disco / Funk'
  | '90s / 2000s'
  | '80s';

export type EnergyType =
  | 'Lounge/Listening Party'
  | 'After Party'
  | 'Sunset'
  | 'Warm-up'
  | 'Peak Time'
  | 'Lounge'
  | 'Closing'
  | 'All Night Long';

export type Gender = 'Male' | 'Female' | 'Other';

export type InstrumentType =
  | 'CDJ / Turntables'
  | 'Synthesizer'
  | 'Saxophone'
  | 'Trumpet'
  | 'Guitar'
  | 'Violin'
  | 'Flute'
  | 'Vocalist'
  | 'Piano / Keys'
  | 'Oud'
  | 'Darbuka'
  | 'Bongos';

export interface ArtistProfile {
  gender?: Gender;
  userId: string;
  isHistoryHidden?: boolean; // when true, history card is hidden from managers and other artists
  hasCompletedBooking?: boolean; // true once the artist has ≥1 completed booking — drives the verified badge on Network cards
  primaryGenre: GenreType;
  secondaryGenres: GenreType[];
  instruments?: InstrumentType[];
  minRate?: number;
  basedIn?: string;
  nationality?: string;
  idDocumentUrl?: string;
  soundcloudUrl?: string;
  mixcloudUrl?: string;
  instagramUrl?: string;
  spotifyUrl?: string;
  mediaLinks?: {
    soundcloud?: string;
    mixcloud?: string;
    instagram?: string;
    spotify?: string;
  };
}

// ─── Venue ───────────────────────────────────────────────────────────────────

/** Six types, each with a bundled image in lib/venue-images.ts. Venues have no
 *  photo upload — the type IS the picture, so this union and that map must stay
 *  in lockstep. */
export type VenueType =
  | 'Dance Club'
  | 'Beach Club'
  | 'Lounge'
  | 'Cocktail Bar'
  | 'Rooftop'
  | 'Live Music Venue';

export type AudienceType =
  | 'Tourist-heavy'
  | 'Local crowd'
  | 'High-end / VIP'
  | 'Mixed / casual'
  | 'Corporate'
  | 'Party Crowd'
  | 'Music Lovers'
  | 'Neighbourhood Bar';

export type SubVibe =
  | 'Melodic'
  | 'Groovy'
  | 'Underground'
  | 'Commercial'
  | 'High Energy'
  | 'Chill'
  | 'Dark'
  | 'Tribal'
  | 'Percussive'
  | 'Urban'
  | 'Soul';

export interface GoogleMapsLocation {
  lat: number;
  lng: number;
  address: string;
  placeId?: string;
}

export interface VenueBilling {
  companyName: string;
  companyAddress: string;
  trnNumber: string;
}

export interface Venue {
  id: string;
  managerId: string;
  name: string;
  venueType: VenueType;
  googleMapsLocation: GoogleMapsLocation;
  capacity?: string;
  rulesTemplate?: string;
  preferredEnergy: EnergyType[];
  genrePreferences: GenreType[];
  vibeDescription?: string;
  // NOTE: no photo fields. Venue images are derived from `venueType` — see
  // lib/venue-images.ts. `photo_urls` / `admin_photo_url` still exist in Postgres but
  // nothing reads them; they predate the type-derived images.
  instagramUrl?: string;
  musicLink?: string;
  audienceType?: AudienceType[];
  subVibe?: SubVibe[];
  billing?: VenueBilling;
  /** Weekly programme — recurring set templates the calendar auto-fills forever. */
  schedule?: VenueSchedule;
  color: string; // hex color chosen by manager
  isHidden: boolean;
  isComplete: boolean;
  verificationStatus?: 'pending' | 'verified' | 'rejected'; // 'pending' until we review the venue; show-only badge (does not gate anything yet)
  createdAt: string;
  updatedAt: string;
}

// ─── Lineup ──────────────────────────────────────────────────────────────────

export type LineupStatus = 'active' | 'removed' | 'pending';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

// Legacy venue-specific lineup (kept for backward compatibility)
export interface Lineup {
  id: string;
  venueId: string;
  artistId: string;
  status: LineupStatus;
  invitedAt: string;
  acceptedAt?: string;
  removedAt?: string;
}

// ─── Global Lineup ──────────────────────────────────────────────────────────

// A DJ added to the manager's global lineup (not tied to any venue)
export interface GlobalLineupEntry {
  id: string;
  managerId: string;
  artistId: string;
  status: LineupStatus;
  addedAt: string;
  removedAt?: string;
  notes?: string;
}

// An assignment linking a global lineup DJ to a specific venue
export interface VenueAssignment {
  id: string;
  globalLineupId: string; // references GlobalLineupEntry.id
  venueId: string;
  artistId: string;
  assignedAt: string;
  removedAt?: string;
  status: 'active' | 'removed';
}

// A pending invite to an artist by EMAIL who isn't on Nexgig yet. Once they sign up
// with this email, claim_roster_invites() converts it into a real global_lineup +
// venue_assignments. Backed by the `roster_invites` table.
export interface RosterInvite {
  id: string;
  managerId: string;
  email: string;          // lower-cased
  artistName?: string;    // the name the manager typed (shown as the "Invited" chip)
  venueIds: string[];     // venues to assign on signup
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: string;
}

// ─── Venue Schedule (weekly programme) ────────────────────────────────────────

/** One recurring set in a venue's weekly programme. Each set belongs to ONE weekday
 *  (`day`, Monday-first: 0=Mon … 6=Sun); a weekday can hold several sets (an early + a
 *  late set). The calendar auto-fills a real Slot for every future date matching a set's
 *  day/time — see lib/venue-schedule.ts. */
export interface VenueScheduleSet {
  id: string;
  name?: string;
  day: number;         // Monday-first: 0=Mon … 6=Sun
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
}

export type VenueSchedule = VenueScheduleSet[];

// ─── Slot ────────────────────────────────────────────────────────────────────

export interface Slot {
  id: string;
  venueId: string;
  date: string; // YYYY-MM-DD
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  /** True when the calendar auto-created this slot from the venue's weekly programme.
   *  Distinguishes recurring nights from manual one-offs so a programme edit only ever
   *  touches its own EMPTY future slots — never a manually-added slot or a booked night. */
  scheduleGenerated?: boolean;
  createdAt: string;
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed'
  | 'past_confirmation'
  /** Nobody answered before the gig ended. Dead: no action can change it. Set by
   *  lib/expire-requests.ts — see there for why it is a real status, not a badge. */
  | 'expired';

export interface Booking {
  id: string;
  slotId: string;
  venueId: string;
  artistId: string;
  managerId: string;
  status: BookingStatus;
  cancellationReason?: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  // Snapshot of slot data captured when booking is completed — persists even if slot is deleted
  slotDate?: string;      // YYYY-MM-DD
  slotName?: string;
  slotStartTime?: string; // HH:MM
  slotEndTime?: string;   // HH:MM
  venueName?: string;
  /** Snapshot of the venue's type. The venue row can become unreadable (artist
   *  disconnected, venue soft-deleted), and the venue IMAGE is derived from the type
   *  (lib/venue-images.ts) — so we stamp the type on the booking. This REPLACED the old
   *  venuePhotoUrl snapshot, which is why there's no photo field here. */
  venueType?: VenueType;
  hiddenFromCalendar?: boolean; // artist dismissed past booking from calendar view
  hiddenFromManagerCalendar?: boolean; // manager dismissed declined/cancelled booking from their calendar view
  cancellationAcknowledged?: boolean; // artist dismissed the cancellation from New tab — moves to Cancelled tab
  cancelledByArtist?: boolean; // true when the artist themselves cancelled the booking (not the manager)
  cancelledAsRequest?: boolean; // true when manager cancelled a request before artist responded — hidden from artist calendar
  artistRespondedFromRequests?: boolean; // artist tapped Confirm/Decline on a past_confirmation card in Requests tab
  isArtistCreated?: boolean;    // true when artist created this booking (private event)
  privateEventLocation?: string; // only for artist-created private events, never shown to managers
  privateEventOccasion?: string; // occasion key (see lib/occasions.ts) — drives the private-event icon
}

// ─── Notification ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_cancelled'          // manager cancels -> artist
  | 'booking_cancelled_by_artist' // artist cancels -> manager
  | 'booking_request_cancelled'
  | 'past_confirmation_request'
  | 'lineup_invite'
  | 'lineup_request'
  | 'lineup_accepted'
  | 'lineup_declined'
  | 'artist_joined'
  | 'lineup_added'
  | 'lineup_removed'   // manager removes the artist -> artist
  | 'artist_left_venue' // artist leaves a venue -> manager
  | 'venue_assigned'
  | 'venue_removed'
  | 'review_submitted'
  | 'invoice_received'
  | 'invoice_cancelled'
  | 'manager_invite';

// ─── Availability Block ─────────────────────────────────────────────────────

export interface AvailabilityBlock {
  id: string;
  artistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  label?: string;
  blockType?: 'block'; // always 'block' = Unavailable (private_event is now stored as Booking)
  fullDay?: boolean; // if true, covers the entire day
  createdAt: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  relatedId?: string;
  relatedType?: string;
  createdAt: string;
}

// ─── Draft Assignment ───────────────────────────────────────────────────────

// A draft assignment links a DJ to a slot without sending a gig request.
// The manager can freely assign/reassign DJs and then "Send All" to convert to real bookings.
export interface DraftAssignment {
  id: string;
  slotId: string;
  venueId: string;
  artistId: string;
  managerId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Booking Review ─────────────────────────────────────────────────────────

export interface BookingReview {
  id: string;
  bookingId: string;
  artistId: string;
  rating: number; // 1-5
  text?: string;
  createdAt: string;
}

// ─── Conflict ─────────────────────────────────────────────────────────────────

export interface ConflictInfo {
  type: 'booking' | 'availability_block';
  description: string;
  venueName?: string;
  slotName?: string;
  startTime?: string;
  endTime?: string;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'sent' | 'downloaded' | 'cancelled';

export interface InvoiceGig {
  bookingId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  price: number;      // AED
}

export interface Invoice {
  id: string;
  venueId: string;
  venueName: string;
  artistId: string;
  artistLegalName: string;
  artistEmail: string;
  artistLocation: string;
  managerId: string;
  managerName: string;
  venueLegalName: string;
  venueTrnNumber: string;
  venueAddress: string;
  gigs: InvoiceGig[];
  totalAmount: number; // AED
  invoiceNumber: string;
  sentAt: string;      // ISO date
  status: InvoiceStatus;
  isReadByManager?: boolean; // true when manager has opened the invoice detail
  isDeletedByManager?: boolean; // true when manager hides it from their view (artist still sees it)
}

export interface ArtistWithConflict {
  user: User;
  djProfile?: ArtistProfile;
  hasConflict: boolean;
  conflicts: ConflictInfo[];
  lineupStatus: LineupStatus;
}
