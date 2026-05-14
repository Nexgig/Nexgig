import type {
  User, ArtistProfile, Venue, Lineup, Slot, Booking,
  AvailabilityBlock, AppNotification, GlobalLineupEntry, VenueAssignment, DraftAssignment
} from './types';

// ─── Mock Manager ─────────────────────────────────────────────────────────────

export const MOCK_MANAGER: User = {
  id: 'manager-1',
  email: 'tuts@nexgigapp.com',
  phone: '+971501234567',
  accountType: 'manager',
  fullName: 'Tuts',
  profilePhotoUrl: 'https://i.pravatar.cc/150?img=33',
  bio: 'Artist booking manager across multiple venues.',
  location: 'Dubai',
  yearsOfExperience: 8,
  isPhoneVerified: true,
  isEmailVerified: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Mock DJ Users ────────────────────────────────────────────────────────────

const ARTIST_NAMES = [
  'Patch', 'Josh', 'CJ', 'Tuurk', 'Marwan',
  'Klo', 'Joey', 'Ali', 'Cyril', 'Kurlz',
  'Dimi', 'Nader', 'Rafa', 'Boudy', 'Karine',
  'Ksenia', 'Simi',
];

const AVATAR_SEEDS = [12, 47, 68, 56, 15, 22, 34, 44, 63, 71, 8, 29, 53, 18, 41, 60, 77];

export const MOCK_ARTIST: User = {
  id: 'dj-1',
  email: 'patch@nexgigapp.com',
  phone: '+971509876543',
  accountType: 'artist',
  fullName: 'Patch',
  profilePhotoUrl: `https://i.pravatar.cc/150?img=${AVATAR_SEEDS[0]}`,
  bio: 'Dubai-based artist and producer.',
  location: 'Dubai',
  isPhoneVerified: true,
  isEmailVerified: true,
  createdAt: '2024-01-15T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

export const MOCK_ARTISTS: User[] = ARTIST_NAMES.map((name, i) => ({
  id: `dj-${i + 1}`,
  email: `${name.toLowerCase()}@nexgigapp.com`,
  phone: `+97150${String(9000000 + i).padStart(7, '0')}`,
  accountType: 'artist' as const,
  fullName: name,
  profilePhotoUrl: `https://i.pravatar.cc/150?img=${AVATAR_SEEDS[i % AVATAR_SEEDS.length]}`,
  bio: `Artist and producer based in Dubai.`,
  location: 'Dubai',
  isPhoneVerified: true,
  isEmailVerified: true,
  createdAt: '2024-01-15T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
}));

// ─── DJ Profiles ──────────────────────────────────────────────────────────────

const GENRES: import('./types').GenreType[] = [
  'House & Electronic', 'Open Format', 'Techno', 'Afro Beats',
  'Disco & Funk', 'Hip-Hop & R&B', 'Latin', 'Commercial & Top 40',
  'Arabic', 'Lounge / Jazzy / Soulful House',
];

export const MOCK_ARTIST_PROFILES: Record<string, ArtistProfile> = Object.fromEntries(
  ARTIST_NAMES.map((_, i) => [
    `dj-${i + 1}`,
    {
      userId: `dj-${i + 1}`,
      primaryGenre: GENRES[i % GENRES.length],
      secondaryGenres: [GENRES[(i + 1) % GENRES.length]],
      energyType: ['Peak Time', 'Sunset'],
      minRateResidency: 1500 + i * 100,
      minRateOnetime: 2500 + i * 150,
      technicalRider: '2x CDJ-3000, 1x DJM-900NXS2',
    },
  ])
);

// ─── Mock Venues ──────────────────────────────────────────────────────────────

export const MOCK_VENUES: Venue[] = [
  {
    id: 'venue-1',
    managerId: 'manager-1',
    name: 'February30',
    venueType: 'Dance Club',
    googleMapsLocation: { lat: 25.2048, lng: 55.2708, address: 'Dubai, UAE' },
    capacity: '300',
    rulesTemplate: '',
    preferredEnergy: ['Sunset', 'Peak Time'],
    genrePreferences: ['House & Electronic', 'Open Format'],
    vibeDescription: 'Day, Sunset, and Night shifts',
    photoUrls: ['https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=400'],
    color: '#2E75B6',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
  },
  {
    id: 'venue-2',
    managerId: 'manager-1',
    name: 'Lucias',
    venueType: 'Bar / Restaurant',
    googleMapsLocation: { lat: 25.1124, lng: 55.1390, address: 'Dubai, UAE' },
    capacity: '200',
    rulesTemplate: '',
    preferredEnergy: ['Lounge/Listening Party', 'Peak Time'],
    genrePreferences: ['Afro Beats', 'Latin', 'Open Format'],
    vibeDescription: 'Day and Night shifts',
    photoUrls: ['https://images.unsplash.com/photo-1540541338287-41700207dee6?w=400'],
    color: '#8B5CF6',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'venue-3',
    managerId: 'manager-1',
    name: 'Lady Bird',
    venueType: 'Rooftop',
    googleMapsLocation: { lat: 25.0657, lng: 55.1713, address: 'Dubai, UAE' },
    capacity: '250',
    rulesTemplate: '',
    preferredEnergy: ['Sunset', 'Peak Time'],
    genrePreferences: ['House & Electronic', 'Disco & Funk'],
    vibeDescription: 'Day and Night shifts',
    photoUrls: ['https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400'],
    color: '#22C55E',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  },
  {
    id: 'venue-4',
    managerId: 'manager-1',
    name: 'Limonata',
    venueType: 'Beach Club',
    googleMapsLocation: { lat: 25.0800, lng: 55.1400, address: 'Dubai, UAE' },
    capacity: '350',
    rulesTemplate: '',
    preferredEnergy: ['Lounge/Listening Party', 'Sunset'],
    genrePreferences: ['Afro Beats', 'Latin', 'Commercial & Top 40'],
    vibeDescription: 'Day and Night shifts',
    photoUrls: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'],
    color: '#F59E0B',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-03-05T00:00:00Z',
    updatedAt: '2024-03-05T00:00:00Z',
  },
  {
    id: 'venue-5',
    managerId: 'manager-1',
    name: 'Yubi',
    venueType: 'Dance Club',
    googleMapsLocation: { lat: 25.1900, lng: 55.2600, address: 'Dubai, UAE' },
    capacity: '400',
    rulesTemplate: '',
    preferredEnergy: ['After Party', 'Peak Time'],
    genrePreferences: ['Techno', 'House & Electronic'],
    vibeDescription: 'Night x2 shifts',
    photoUrls: ['https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400'],
    color: '#EF4444',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-03-10T00:00:00Z',
    updatedAt: '2024-03-10T00:00:00Z',
  },
  {
    id: 'venue-6',
    managerId: 'manager-1',
    name: 'Theater',
    venueType: 'Dance Club',
    googleMapsLocation: { lat: 25.2200, lng: 55.3000, address: 'Dubai, UAE' },
    capacity: '500',
    rulesTemplate: '',
    preferredEnergy: ['Peak Time', 'After Party'],
    genrePreferences: ['Open Format', 'Hip-Hop & R&B', 'Commercial & Top 40'],
    vibeDescription: 'Night shift',
    photoUrls: ['https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400'],
    color: '#EC4899',
    isHidden: false,
    isComplete: true,
    createdAt: '2024-03-15T00:00:00Z',
    updatedAt: '2024-03-15T00:00:00Z',
  },
];

// ─── Mock Lineups (Legacy) ────────────────────────────────────────────────────

export const MOCK_LINEUPS: Lineup[] = [];

// ─── Mock Global Lineup ──────────────────────────────────────────────────────

export const MOCK_GLOBAL_LINEUP: GlobalLineupEntry[] = ARTIST_NAMES.map((_, i) => ({
  id: `gr-${i + 1}`,
  managerId: 'manager-1',
  artistId: `dj-${i + 1}`,
  status: 'active' as const,
  addedAt: '2024-01-15T00:00:00Z',
}));

// ─── Mock Venue Assignments ──────────────────────────────────────────────────
// Assign all DJs to all venues for demo purposes

export const MOCK_VENUE_ASSIGNMENTS: VenueAssignment[] = ARTIST_NAMES.flatMap((_, i) =>
  MOCK_VENUES.map((v, vi) => ({
    id: `va-${i + 1}-${vi + 1}`,
    globalLineupId: `gr-${i + 1}`,
    venueId: v.id,
    artistId: `dj-${i + 1}`,
    assignedAt: '2024-01-16T00:00:00Z',
    status: 'active' as const,
  }))
);

// ─── Mock Slots ───────────────────────────────────────────────────────────────
// Schedule: week of Apr 6 (Mon) – Apr 12 (Sun) 2026
// Shift times: Day 13:00–17:00 | Sunset 17:00–21:00 | Night 21:00–01:00

export const MOCK_SLOTS: Slot[] = [
  // ── February30 ──────────────────────────────────────────────────────────────
  // Day: Fri Apr 10 = Patch, Sat Apr 11 = Josh, Sun Apr 12 = CJ
  { id: 'f30-day-fri',    venueId: 'venue-1', date: '2026-04-10', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-day-sat',    venueId: 'venue-1', date: '2026-04-11', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-day-sun',    venueId: 'venue-1', date: '2026-04-12', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  // Sunset: Wed Apr 8 = Tuurk, Thu Apr 9 = Marwan, Fri Apr 10 = Tuurk, Sat Apr 11 = Klo, Sun Apr 12 = Marwan
  { id: 'f30-sun-wed',    venueId: 'venue-1', date: '2026-04-08', name: 'Sunset', startTime: '17:00', endTime: '21:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-sun-thu',    venueId: 'venue-1', date: '2026-04-09', name: 'Sunset', startTime: '17:00', endTime: '21:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-sun-fri',    venueId: 'venue-1', date: '2026-04-10', name: 'Sunset', startTime: '17:00', endTime: '21:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-sun-sat',    venueId: 'venue-1', date: '2026-04-11', name: 'Sunset', startTime: '17:00', endTime: '21:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-sun-sun',    venueId: 'venue-1', date: '2026-04-12', name: 'Sunset', startTime: '17:00', endTime: '21:00', createdAt: '2026-04-01T00:00:00Z' },
  // Night: Tue Apr 7 = Joey, Wed Apr 8 = Ali, Thu Apr 9 = Joey, Fri Apr 10 = Cyril+Kurlz, Sat Apr 11 = Kurlz+Dimi, Sun Apr 12 = Nader
  { id: 'f30-ngt-tue',    venueId: 'venue-1', date: '2026-04-07', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-ngt-wed',    venueId: 'venue-1', date: '2026-04-08', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-ngt-thu',    venueId: 'venue-1', date: '2026-04-09', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-ngt-fri',    venueId: 'venue-1', date: '2026-04-10', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-ngt-sat',    venueId: 'venue-1', date: '2026-04-11', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'f30-ngt-sun',    venueId: 'venue-1', date: '2026-04-12', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },

  // ── Lucias ──────────────────────────────────────────────────────────────────
  // Day: Sat Apr 11 = Rafa, Sun Apr 12 = Boudy
  { id: 'luc-day-sat',    venueId: 'venue-2', date: '2026-04-11', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'luc-day-sun',    venueId: 'venue-2', date: '2026-04-12', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  // Night: Tue Apr 7 = Rafa, Wed Apr 8 = Rafa, Thu Apr 9 = Boudy, Fri Apr 10 = Joey, Sat Apr 11 = Marwan
  { id: 'luc-ngt-tue',    venueId: 'venue-2', date: '2026-04-07', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'luc-ngt-wed',    venueId: 'venue-2', date: '2026-04-08', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'luc-ngt-thu',    venueId: 'venue-2', date: '2026-04-09', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'luc-ngt-fri',    venueId: 'venue-2', date: '2026-04-10', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'luc-ngt-sat',    venueId: 'venue-2', date: '2026-04-11', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },

  // ── Lady Bird ────────────────────────────────────────────────────────────────
  // Day: (empty this week — slots exist but no assignments)
  { id: 'lb-day-fri',     venueId: 'venue-3', date: '2026-04-10', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'lb-day-sat',     venueId: 'venue-3', date: '2026-04-11', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  // Night: Fri Apr 10 = Karine+Klo, Sat Apr 11 = Joey+Ksenia
  { id: 'lb-ngt-fri',     venueId: 'venue-3', date: '2026-04-10', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'lb-ngt-sat',     venueId: 'venue-3', date: '2026-04-11', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },

  // ── Limonata ─────────────────────────────────────────────────────────────────
  // Empty this week — slots exist but no assignments
  { id: 'lim-day-fri',    venueId: 'venue-4', date: '2026-04-10', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'lim-day-sat',    venueId: 'venue-4', date: '2026-04-11', name: 'Day',    startTime: '13:00', endTime: '17:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'lim-ngt-fri',    venueId: 'venue-4', date: '2026-04-10', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'lim-ngt-sat',    venueId: 'venue-4', date: '2026-04-11', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },

  // ── Yubi ─────────────────────────────────────────────────────────────────────
  // Night x2: Fri Apr 10 = Simi (slot 1), Sat Apr 11 = Simi (slot 1)
  { id: 'yubi-n1-fri',    venueId: 'venue-5', date: '2026-04-10', name: 'Night 1', startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'yubi-n2-fri',    venueId: 'venue-5', date: '2026-04-10', name: 'Night 2', startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'yubi-n1-sat',    venueId: 'venue-5', date: '2026-04-11', name: 'Night 1', startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'yubi-n2-sat',    venueId: 'venue-5', date: '2026-04-11', name: 'Night 2', startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },

  // ── Theater ──────────────────────────────────────────────────────────────────
  // Night: empty this week
  { id: 'thtr-ngt-fri',   venueId: 'venue-6', date: '2026-04-10', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'thtr-ngt-sat',   venueId: 'venue-6', date: '2026-04-11', name: 'Night',  startTime: '21:00', endTime: '01:00', createdAt: '2026-04-01T00:00:00Z' },
];

// ─── Mock Bookings ────────────────────────────────────────────────────────────

// DJ ID lookup: Patch=dj-1, Josh=dj-2, CJ=dj-3, Tuurk=dj-4, Marwan=dj-5,
// Klo=dj-6, Joey=dj-7, Ali=dj-8, Cyril=dj-9, Kurlz=dj-10,
// Dimi=dj-11, Nader=dj-12, Rafa=dj-13, Boudy=dj-14, Karine=dj-15,
// Ksenia=dj-16, Simi=dj-17

export const MOCK_BOOKINGS: Booking[] = [
  // February30 — Day
  { id: 'bk-f30-day-fri',  slotId: 'f30-day-fri',  venueId: 'venue-1', artistId: 'dj-1',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Patch
  { id: 'bk-f30-day-sat',  slotId: 'f30-day-sat',  venueId: 'venue-1', artistId: 'dj-2',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Josh
  { id: 'bk-f30-day-sun',  slotId: 'f30-day-sun',  venueId: 'venue-1', artistId: 'dj-3',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // CJ
  // February30 — Sunset
  { id: 'bk-f30-sun-wed',  slotId: 'f30-sun-wed',  venueId: 'venue-1', artistId: 'dj-4',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Tuurk
  { id: 'bk-f30-sun-thu',  slotId: 'f30-sun-thu',  venueId: 'venue-1', artistId: 'dj-5',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Marwan
  { id: 'bk-f30-sun-fri',  slotId: 'f30-sun-fri',  venueId: 'venue-1', artistId: 'dj-4',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Tuurk
  { id: 'bk-f30-sun-sat',  slotId: 'f30-sun-sat',  venueId: 'venue-1', artistId: 'dj-6',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Klo
  { id: 'bk-f30-sun-sun',  slotId: 'f30-sun-sun',  venueId: 'venue-1', artistId: 'dj-5',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Marwan
  // February30 — Night
  { id: 'bk-f30-ngt-tue',  slotId: 'f30-ngt-tue',  venueId: 'venue-1', artistId: 'dj-7',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Joey
  { id: 'bk-f30-ngt-wed',  slotId: 'f30-ngt-wed',  venueId: 'venue-1', artistId: 'dj-8',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Ali
  { id: 'bk-f30-ngt-thu',  slotId: 'f30-ngt-thu',  venueId: 'venue-1', artistId: 'dj-7',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Joey
  { id: 'bk-f30-ngt-fri1', slotId: 'f30-ngt-fri',  venueId: 'venue-1', artistId: 'dj-9',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Cyril
  { id: 'bk-f30-ngt-fri2', slotId: 'f30-ngt-fri',  venueId: 'venue-1', artistId: 'dj-10', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Kurlz
  { id: 'bk-f30-ngt-sat1', slotId: 'f30-ngt-sat',  venueId: 'venue-1', artistId: 'dj-10', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Kurlz
  { id: 'bk-f30-ngt-sat2', slotId: 'f30-ngt-sat',  venueId: 'venue-1', artistId: 'dj-11', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Dimi
  { id: 'bk-f30-ngt-sun',  slotId: 'f30-ngt-sun',  venueId: 'venue-1', artistId: 'dj-12', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Nader
  // Lucias — Day
  { id: 'bk-luc-day-sat',  slotId: 'luc-day-sat',  venueId: 'venue-2', artistId: 'dj-13', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Rafa
  { id: 'bk-luc-day-sun',  slotId: 'luc-day-sun',  venueId: 'venue-2', artistId: 'dj-14', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Boudy
  // Lucias — Night
  { id: 'bk-luc-ngt-tue',  slotId: 'luc-ngt-tue',  venueId: 'venue-2', artistId: 'dj-13', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Rafa
  { id: 'bk-luc-ngt-wed',  slotId: 'luc-ngt-wed',  venueId: 'venue-2', artistId: 'dj-13', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Rafa
  { id: 'bk-luc-ngt-thu',  slotId: 'luc-ngt-thu',  venueId: 'venue-2', artistId: 'dj-14', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Boudy
  { id: 'bk-luc-ngt-fri',  slotId: 'luc-ngt-fri',  venueId: 'venue-2', artistId: 'dj-7',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Joey
  { id: 'bk-luc-ngt-sat',  slotId: 'luc-ngt-sat',  venueId: 'venue-2', artistId: 'dj-5',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Marwan
  // Lady Bird — Night
  { id: 'bk-lb-ngt-fri1',  slotId: 'lb-ngt-fri',   venueId: 'venue-3', artistId: 'dj-15', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Karine
  { id: 'bk-lb-ngt-fri2',  slotId: 'lb-ngt-fri',   venueId: 'venue-3', artistId: 'dj-6',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Klo
  { id: 'bk-lb-ngt-sat1',  slotId: 'lb-ngt-sat',   venueId: 'venue-3', artistId: 'dj-7',  managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Joey
  { id: 'bk-lb-ngt-sat2',  slotId: 'lb-ngt-sat',   venueId: 'venue-3', artistId: 'dj-16', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Ksenia
  // Yubi — Night 1 (Simi on Fri + Sat)
  { id: 'bk-yubi-n1-fri',  slotId: 'yubi-n1-fri',  venueId: 'venue-5', artistId: 'dj-17', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Simi
  { id: 'bk-yubi-n1-sat',  slotId: 'yubi-n1-sat',  venueId: 'venue-5', artistId: 'dj-17', managerId: 'manager-1', status: 'confirmed', isCompleted: false, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', confirmedAt: '2026-04-01T00:00:00Z' }, // Simi
];

// ─── Mock Availability Blocks ─────────────────────────────────────────────────

export const MOCK_AVAILABILITY_BLOCKS: AvailabilityBlock[] = [
  {
    id: 'block-1', artistId: 'dj-1',
    date: '2026-04-10',
    startTime: '18:00', endTime: '23:59',
    label: 'Private event',
    createdAt: '2024-04-01T00:00:00Z',
  },
  {
    id: 'block-2', artistId: 'dj-3',
    date: '2026-04-12',
    startTime: '00:00', endTime: '23:59',
    label: 'Vacation',
    createdAt: '2024-04-01T00:00:00Z',
  },
];

// ─── Mock Notifications ───────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS_MANAGER: AppNotification[] = [];

export const MOCK_NOTIFICATIONS_ARTIST: AppNotification[] = [];

// ─── Mock Draft Assignments ───────────────────────────────────────────────────

export const MOCK_DRAFTS: DraftAssignment[] = [];
