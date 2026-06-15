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
  bio?: string;
  location?: string;
  yearsOfExperience?: number;
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

export type VenueType =
  | 'Dance Club'
  | 'Beach Club'
  | 'Lounge'
  | 'Cocktail Bar'
  | 'Bar / Restaurant'
  | 'Bar / Club'
  | 'Rooftop'
  | 'Live Music Venue'
  | 'Event Space'
  | 'Wedding Venue'
  | 'Hotel / Resort';

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
  photoUrls: string[];
  instagramUrl?: string;
  musicLink?: string;
  audienceType?: AudienceType[];
  subVibe?: SubVibe[];
  billing?: VenueBilling;
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

// ─── Slot ────────────────────────────────────────────────────────────────────

export interface Slot {
  id: string;
  venueId: string;
  date: string; // YYYY-MM-DD
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  createdAt: string;
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export type BookingStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'past_confirmation';

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
  venueName?: string;     // snapshot of venue name
  hiddenFromCalendar?: boolean; // artist dismissed past booking from calendar view
  hiddenFromManagerCalendar?: boolean; // manager dismissed declined/cancelled booking from their calendar view
  cancellationAcknowledged?: boolean; // artist dismissed the cancellation from New tab — moves to Cancelled tab
  cancelledByArtist?: boolean; // true when the artist themselves cancelled the booking (not the manager)
  cancelledAsRequest?: boolean; // true when manager cancelled a request before artist responded — hidden from artist calendar
  artistRespondedFromRequests?: boolean; // artist tapped Confirm/Decline on a past_confirmation card in Requests tab
  isArtistCreated?: boolean;    // true when artist created this booking (private event)
  privateEventLocation?: string; // only for artist-created private events, never shown to managers
}

// ─── Notification ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_request_cancelled'
  | 'past_confirmation_request'
  | 'lineup_invite'
  | 'lineup_accepted'
  | 'lineup_declined'
  | 'artist_joined'
  | 'lineup_added'
  | 'lineup_removed'
  | 'venue_assigned'
  | 'venue_removed'
  | 'review_submitted'
  | 'invoice_received'
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

export type InvoiceStatus = 'sent' | 'downloaded';

export interface InvoiceGig {
  bookingId: string;
  date: string;       // YYYY-MM-DD
  setName: string;
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
