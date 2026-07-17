import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { syncBookingStatus } from './booking-sync';
import type {
  User, ArtistProfile, Venue, Lineup, Slot, Booking, BookingStatus,
  AvailabilityBlock, AppNotification, GlobalLineupEntry, VenueAssignment, DraftAssignment,
  Invoice, InvoiceStatus
} from './types';
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ─── Auth Store ──────────────────────────────────────────────────────────────

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => boolean;
  signOut: () => void;
  setCurrentUser: (user: User) => void;
  updateProfile: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      signIn: (_email, _password) => {
        return false; // sign in handled by Supabase in sign-in.tsx
      },
      signOut: () => set({ currentUser: null, isAuthenticated: false }),
      setCurrentUser: (user) => set({ currentUser: user, isAuthenticated: true }),
      updateProfile: (updates) => set((state) => ({
        currentUser: state.currentUser ? { ...state.currentUser, ...updates } : null,
      })),
    }),
    {
      name: 'nexgig:auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ currentUser: state.currentUser, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// ─── Venue Store ─────────────────────────────────────────────────────────────

interface VenueState {
  venues: Venue[];
  addVenue: (venue: Venue) => void;
  updateVenue: (id: string, updates: Partial<Venue>) => void;
  /** Soft-delete — see the impl. There is no user-facing "hide venue" feature. */
  hideVenue: (id: string) => void;
  deleteVenue: (id: string) => void;
  reorderVenues: (orderedIds: string[]) => void;
  getVenueById: (id: string) => Venue | undefined;
  getVenueName: (id: string) => string;
  clearVenues: () => void;
}

export const useVenueStore = create<VenueState>()(
  persist(
    (set, get) => ({
  venues: [],
  addVenue: (venue) => set((state) => ({ venues: [...state.venues, { ...venue, verificationStatus: venue.verificationStatus ?? 'pending' }] })),
  clearVenues: () => set({ venues: [] }),
  updateVenue: (id, updates) => set((state) => ({
    venues: state.venues.map((v) => v.id === id ? { ...v, ...updates, updatedAt: new Date().toISOString() } : v),
  })),
  // This is the SOFT-DELETE, not a hide feature (that was removed — the toggle in
  // venue-detail was dead code). Delete Venue sets isHidden so the row + slots stay
  // alive and completed gigs keep resolving the real venue name. There is no unhide:
  // a deleted venue stays deleted.
  hideVenue: (id) => set((state) => ({
    venues: state.venues.map((v) => v.id === id ? { ...v, isHidden: true, updatedAt: new Date().toISOString() } : v),
  })),
  deleteVenue: (id) => set((state) => ({
    venues: state.venues.filter((v) => v.id !== id),
  })),
  reorderVenues: (orderedIds) => set((state) => {
    const map = new Map(state.venues.map((v) => [v.id, v]));
    const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Venue[];
    const rest = state.venues.filter((v) => !orderedIds.includes(v.id));
    return { venues: [...reordered, ...rest] };
  }),
  getVenueById: (id) => get().venues.find((v) => v.id === id),
  getVenueName: (id) => get().venues.find((v) => v.id === id)?.name ?? 'Unknown Venue',
}),
    {
      name: 'nexgig:venues',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ venues: state.venues }),
    }
  )
);

// ─── Lineup Store (now includes global lineup + venue assignments) ───────────

interface LineupState {
  // Legacy venue-specific lineups (kept for backward compat)
  lineups: Lineup[];
  // Global lineup: Artists added to the manager's pool
  globalLineup: GlobalLineupEntry[];
  // Venue assignments: links global lineup DJs to specific venues
  venueAssignments: VenueAssignment[];
  // DJ data
  artistProfiles: Record<string, ArtistProfile>;
  artistUsers: User[];

  // Legacy methods (still work for backward compat)
  addLineup: (lineup: Lineup) => void;
  removeFromLineup: (venueId: string, artistId: string) => void;
  getLineupByVenue: (venueId: string) => Lineup[];
  getLineupByArtist: (artistId: string) => Lineup[];

  // Global lineup methods
  addToGlobalLineup: (entry: GlobalLineupEntry) => void;
  removeFromGlobalLineup: (artistId: string) => void;
  getGlobalLineupByManager: (managerId: string) => GlobalLineupEntry[];
  isOnGlobalLineup: (managerId: string, artistId: string) => boolean;

  // Venue assignment methods
  assignToVenue: (assignment: VenueAssignment) => void;
  removeFromVenue: (venueId: string, artistId: string) => void;
  resetVenueAssignmentsForArtist: (artistId: string, assignments: VenueAssignment[]) => void;
  getAssignmentsByVenue: (venueId: string) => VenueAssignment[];
  getAssignmentsByArtist: (artistId: string) => VenueAssignment[];
  getVenuesForArtist: (artistId: string) => string[];
  isArtistAssignedToVenue: (venueId: string, artistId: string) => boolean;

  // DJ data methods
  getArtistProfile: (userId: string) => ArtistProfile | undefined;
  getArtistUser: (userId: string) => User | undefined;
  updateArtistProfile: (userId: string, updates: Partial<ArtistProfile>) => void;
  addArtistUser: (user: User) => void;
  updateArtistUser: (userId: string, updates: Partial<User>) => void;
  isEmailTaken: (email: string, excludeUserId?: string) => boolean;
  isUsernameTaken: (username: string, excludeUserId?: string) => boolean;
  getAllUsers: () => User[];
  clearGlobalLineup: () => void;
clearArtistUsers: () => void;
}

export const useLineupStore = create<LineupState>()(
  persist(
    (set, get) => ({
  lineups: [],
globalLineup: [],
venueAssignments: [],
artistProfiles: {},
artistUsers: [],

  // Legacy methods
  addLineup: (lineup) => set((state) => ({ lineups: [...state.lineups, lineup] })),
  removeFromLineup: (venueId, artistId) => set((state) => ({
    lineups: state.lineups.map((r) =>
      r.venueId === venueId && r.artistId === artistId
        ? { ...r, status: 'removed' as const, removedAt: new Date().toISOString() }
        : r
    ),
  })),
  getLineupByVenue: (venueId) => get().lineups.filter((r) => r.venueId === venueId && r.status === 'active'),
  getLineupByArtist: (artistId) => get().lineups.filter((r) => r.artistId === artistId && r.status === 'active'),

  // Global lineup methods
  addToGlobalLineup: (entry) => set((state) => {
  const exists = state.globalLineup.some(
    (r) => r.managerId === entry.managerId && r.artistId === entry.artistId && r.status === 'active'
  );
  if (exists) return state;
  return { globalLineup: [...state.globalLineup, entry] };
}),
  removeFromGlobalLineup: (artistId) => set((state) => ({
    globalLineup: state.globalLineup.map((r) =>
      r.artistId === artistId ? { ...r, status: 'removed' as const, removedAt: new Date().toISOString() } : r
    ),
    // Also remove all venue assignments for this DJ
    venueAssignments: state.venueAssignments.map((a) =>
      a.artistId === artistId ? { ...a, status: 'removed' as const, removedAt: new Date().toISOString() } : a
    ),
  })),
  getGlobalLineupByManager: (managerId) =>
    get().globalLineup.filter((r) => r.managerId === managerId && r.status === 'active'),
  isOnGlobalLineup: (managerId, artistId) =>
    get().globalLineup.some((r) => r.managerId === managerId && r.artistId === artistId && r.status === 'active'),

  // Venue assignment methods
  assignToVenue: (assignment) => set((state) => {
  const exists = state.venueAssignments.some(
    (a) => a.venueId === assignment.venueId && a.artistId === assignment.artistId && a.status === 'active'
  );
  if (exists) return state;
  return { venueAssignments: [...state.venueAssignments, assignment] };
}),
  removeFromVenue: (venueId, artistId) => set((state) => ({
    venueAssignments: state.venueAssignments.map((a) =>
      a.venueId === venueId && a.artistId === artistId
        ? { ...a, status: 'removed' as const, removedAt: new Date().toISOString() }
        : a
    ),
  })),
  resetVenueAssignmentsForArtist: (artistId, assignments) => set((state) => ({
    venueAssignments: [
      ...state.venueAssignments.filter((a) => a.artistId !== artistId),
      ...assignments,
    ],
  })),
  getAssignmentsByVenue: (venueId) =>
    get().venueAssignments.filter((a) => a.venueId === venueId && a.status === 'active'),
  getAssignmentsByArtist: (artistId) =>
    get().venueAssignments.filter((a) => a.artistId === artistId && a.status === 'active'),
  getVenuesForArtist: (artistId) =>
    get().venueAssignments.filter((a) => a.artistId === artistId && a.status === 'active').map((a) => a.venueId),
  isArtistAssignedToVenue: (venueId, artistId) =>
    get().venueAssignments.some((a) => a.venueId === venueId && a.artistId === artistId && a.status === 'active'),

  // DJ data methods
  getArtistProfile: (userId) => get().artistProfiles[userId],
  getArtistUser: (userId) => {
    // A deleted artist leaves their bookings with a null artist_id. Return a
    // stable "Former Artist" placeholder for a null/undefined id so those
    // bookings still render (with their real status) on the manager's calendar
    // and booking screens, instead of disappearing and leaving an orphaned dot.
    if (userId == null) {
      return {
        id: '', email: '', phone: '', accountType: 'artist' as const,
        fullName: 'Former Artist', isPhoneVerified: false, isEmailVerified: false,
        createdAt: '', updatedAt: '',
      } as User;
    }
    return get().artistUsers.find((u) => u.id === userId);
  },
  updateArtistProfile: (userId, updates) => set((state) => ({
    artistProfiles: {
      ...state.artistProfiles,
      // Always MERGE onto any existing profile and keep userId, so a partial
      // update (e.g. the history-hide toggle sending only { isHistoryHidden })
      // can never wipe the other fields or create a half-empty profile.
      [userId]: { ...(state.artistProfiles[userId] ?? {}), ...updates, userId } as ArtistProfile,
    },
  })),
  addArtistUser: (user) => set((state) => {
  if (state.artistUsers.some((u) => u.id === user.id)) return state;
  return { artistUsers: [...state.artistUsers, user] };
}),
  updateArtistUser: (userId, updates) => set((state) => ({
    artistUsers: state.artistUsers.map((u) => u.id === userId ? { ...u, ...updates } : u),
  })),
  isEmailTaken: (email, excludeUserId) => {
    const lower = email.toLowerCase().trim();
    return get().artistUsers.some((u) => u.id !== excludeUserId && u.email.toLowerCase().trim() === lower);
  },
  isUsernameTaken: (username, excludeUserId) => {
    const lower = username.toLowerCase().trim();
    return get().artistUsers.some((u) => u.id !== excludeUserId && u.username?.toLowerCase().trim() === lower);
  },
  getAllUsers: () => get().artistUsers,
  clearGlobalLineup: () => set({ globalLineup: [] }),
clearArtistUsers: () => set({ artistUsers: [] }),
}),
    {
      name: 'nexgig:lineup:v3',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        artistProfiles: state.artistProfiles,
        artistUsers: state.artistUsers,
        globalLineup: state.globalLineup,
        venueAssignments: state.venueAssignments,
        lineups: state.lineups,
      }),
    }
  )
);

// ─── Slot Store ───────────────────────────────────────────────────────────────

interface SlotState {
  slots: Slot[];
  addSlot: (slot: Slot) => void;
  bulkAddSlots: (slots: Slot[]) => void;
  updateSlot: (id: string, updates: Partial<Slot>) => void;
  deleteSlot: (id: string) => void;
  deleteSlotsByMonth: (venueIds: string[], year: number, month: number) => void;
  getSlotsByVenue: (venueId: string) => Slot[];
  getSlotsByDate: (venueId: string, date: string) => Slot[];
  getSlotsByMonth: (venueIds: string[], year: number, month: number) => Slot[];
  getSlotById: (id: string) => Slot | undefined;
  clearSlots: () => void;
}

export const useSlotStore = create<SlotState>()(
  persist(
    (set, get) => ({
  slots: [],
  addSlot: (slot) => set((state) => ({ slots: [...state.slots, slot] })),
  clearSlots: () => set({ slots: [] }),
  bulkAddSlots: (slots) => set((state) => ({ slots: [...state.slots, ...slots] })),
  updateSlot: (id, updates) => set((state) => ({
    slots: state.slots.map((s) => s.id === id ? { ...s, ...updates } : s),
  })),
  deleteSlot: (id) => {
    // Find the slot before removing it (for snapshot data)
    const slot = get().slots.find((s) => s.id === id);
    // Remove the slot
    set((state) => ({ slots: state.slots.filter((s) => s.id !== id) }));
    if (!slot) return;
    // Cancel all active gig requests attached to this slot
    const bookingStore = useBookingStore.getState();
    const venueStore = useVenueStore.getState();
    const venue = venueStore.venues.find((v) => v.id === slot.venueId);
    const venueName = venue?.name ?? 'Unknown Venue';
    const slotBookings = bookingStore.bookings.filter((b) => b.slotId === id);
    // requested / past_confirmation → delete entirely (no trace on artist side)
    const requestedBookings = slotBookings.filter(
      (b) => b.status === 'requested' || b.status === 'past_confirmation'
    );
    const notifStore = useNotificationStore.getState();
    requestedBookings.forEach((b) => {
      bookingStore.updateBookingStatus(b.id, 'cancelled', {
        cancelledAt: new Date().toISOString(),
        cancellationAcknowledged: true,
        cancelledAsRequest: true,
        slotDate: slot.date,
        slotName: slot.name,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        venueName,
      });
      notifStore.addNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: b.artistId,
        type: 'booking_request_cancelled',
        title: 'Request Cancelled',
        body: `${venueName} — ${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
        isRead: false,
        relatedId: b.id,
        relatedType: 'booking',
        createdAt: new Date().toISOString(),
      });
    });
    // confirmed → cancel
    const confirmedBookings = slotBookings.filter((b) => b.status === 'confirmed');
    confirmedBookings.forEach((b) => {
      bookingStore.updateBookingStatus(b.id, 'cancelled', {
        cancellationReason: 'Slot was deleted by manager',
        slotDate: slot.date,
        slotName: slot.name,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        venueName,
      });
      notifStore.addNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: b.artistId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        body: `${venueName} — ${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
        isRead: false,
        relatedId: b.id,
        relatedType: 'booking',
        createdAt: new Date().toISOString(),
      });
    });
  },
  deleteSlotsByMonth: (venueIds, year, month) => set((state) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return {
      slots: state.slots.filter((s) => !(venueIds.includes(s.venueId) && s.date.startsWith(prefix))),
    };
  }),
  getSlotsByVenue: (venueId) => get().slots.filter((s) => s.venueId === venueId),
  getSlotsByDate: (venueId, date) => get().slots.filter((s) => s.venueId === venueId && s.date === date),
  getSlotsByMonth: (venueIds, year, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return get().slots.filter((s) => venueIds.includes(s.venueId) && s.date.startsWith(prefix));
  },
  getSlotById: (id) => get().slots.find((s) => s.id === id),
}),
    {
      name: 'nexgig:slots',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ slots: state.slots }),
    }
  )
);

// ─── Booking Store ────────────────────────────────────────────────────────────

interface BookingState {
  bookings: Booking[];
  addBooking: (booking: Booking) => void;
  updateBookingStatus: (id: string, status: BookingStatus, extra?: Partial<Booking>) => void;
  updateBookingStatusLocal: (id: string, status: BookingStatus, extra?: Partial<Booking>) => void;
  getBookingsByDJ: (artistId: string) => Booking[];
  getBookingsByVenue: (venueId: string) => Booking[];
  getBookingBySlot: (slotId: string) => Booking | undefined;
  getBookingsBySlot: (slotId: string) => Booking[];
  getConfirmedBookingsByDJ: (artistId: string) => Booking[];
  hideFromCalendar: (id: string) => void;
  hideFromManagerCalendar: (id: string) => void;
  acknowledgeCancellation: (id: string) => void;
  deleteBooking: (id: string) => void;
  clearBookings: () => void;
}

export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
  bookings: [],
  // Upsert by id — NEVER append a duplicate. Two copies of the same booking id
  // (e.g. the dashboard fetch re-adding a booking the layout already loaded) produce
  // duplicate list keys and a stale-vs-fresh render flicker (the confirmed<->cancelled
  // "shake"). If the booking already exists we merge, but only when the incoming row is
  // at least as new as what we hold — so a lagging re-fetch can't revert a fresh local
  // status change (e.g. an artist's just-applied cancel).
  addBooking: (booking) => set((state) => {
    const idx = state.bookings.findIndex((b) => b.id === booking.id);
    if (idx === -1) return { bookings: [...state.bookings, booking] };
    const existing = state.bookings[idx];
    const incomingIsNewer =
      !existing.updatedAt || (!!booking.updatedAt && booking.updatedAt >= existing.updatedAt);
    if (!incomingIsNewer) return state;
    const next = state.bookings.slice();
    next[idx] = { ...existing, ...booking };
    return { bookings: next };
  }),
  // LOCAL-ONLY status patch. Does NOT write to Supabase. Realtime handlers MUST use
  // this (they are applying a change that already came FROM the DB) — writing back
  // would echo into an infinite realtime->write->realtime loop.
  updateBookingStatusLocal: (id, status, extra = {}) => {
    set((state) => ({
      bookings: state.bookings.map((b) =>
        b.id === id
          ? {
              ...b,
              status,
              updatedAt: new Date().toISOString(),
              ...(status === 'confirmed' ? { confirmedAt: new Date().toISOString() } : {}),
              ...(status === 'cancelled' ? { cancelledAt: new Date().toISOString() } : {}),
              ...extra,
            }
          : b
      ),
    }));
  },
  updateBookingStatus: (id, status, extra = {}) => {
    // Local first, then persist. syncBookingStatus does a PARTIAL update (only the
    // columns it builds), so a screen that also calls it directly just double-writes
    // the same values harmlessly.
    get().updateBookingStatusLocal(id, status, extra);
    void syncBookingStatus(id, status, extra as Record<string, any>);
  },
  getBookingsByDJ: (artistId) => get().bookings.filter((b) => b.artistId === artistId),
  getBookingsByVenue: (venueId) => get().bookings.filter((b) => b.venueId === venueId),
  getBookingBySlot: (slotId) => get().bookings.find((b) => b.slotId === slotId && b.status !== 'cancelled' && b.status !== 'declined'),
  getBookingsBySlot: (slotId) => get().bookings.filter((b) => b.slotId === slotId && !b.hiddenFromManagerCalendar),
  getConfirmedBookingsByDJ: (artistId) => get().bookings.filter((b) => b.artistId === artistId && b.status === 'confirmed'),
  hideFromCalendar: (id) => {
    set((state) => ({
      bookings: state.bookings.map((b) => b.id === id ? { ...b, hiddenFromCalendar: true, cancellationAcknowledged: true } : b),
    }));
    // Persist the flags so they survive sign-out. Partial update, so it only
    // touches these columns; for a private event (not in the Supabase bookings
    // table) it matches zero rows and is a harmless no-op.
    const b = get().bookings.find((x) => x.id === id);
    if (b) void syncBookingStatus(id, b.status, { hiddenFromCalendar: true, cancellationAcknowledged: true });
  },
  hideFromManagerCalendar: (id) => {
    set((state) => ({
      bookings: state.bookings.map((b) => b.id === id ? { ...b, hiddenFromManagerCalendar: true } : b),
    }));
    const b = get().bookings.find((x) => x.id === id);
    if (b) void syncBookingStatus(id, b.status, { hiddenFromManagerCalendar: true });
  },
  acknowledgeCancellation: (id) => {
    set((state) => ({
      bookings: state.bookings.map((b) => b.id === id ? { ...b, cancellationAcknowledged: true } : b),
    }));
    const b = get().bookings.find((x) => x.id === id);
    if (b) void syncBookingStatus(id, b.status, { cancellationAcknowledged: true });
  },
  deleteBooking: (id) => set((state) => ({
    bookings: state.bookings.filter((b) => b.id !== id),
  })),
  clearBookings: () => set((state) => ({ bookings: [] })),
}),
    {
      name: 'nexgig:bookings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ bookings: state.bookings }),
    }
  )
)

// ─── Availability Store ───────────────────────────────────────────────────────

interface AvailabilityState {
  blocks: AvailabilityBlock[];
  addBlock: (block: AvailabilityBlock) => void;
  deleteBlock: (id: string) => void;
  resetBlocksForArtist: (artistId: string, blocks: AvailabilityBlock[]) => void;
  getBlocksByDJ: (artistId: string) => AvailabilityBlock[];
}

export const useAvailabilityStore = create<AvailabilityState>()(
  persist(
    (set, get) => ({
      blocks: [],
      addBlock: (block) => set((state) => {
        if (state.blocks.some((b) => b.id === block.id)) return state;
        return { blocks: [...state.blocks, block] };
      }),
      deleteBlock: (id) => set((state) => ({ blocks: state.blocks.filter((b) => b.id !== id) })),
      resetBlocksForArtist: (artistId, newBlocks) => set((state) => ({
        blocks: [...state.blocks.filter((b) => b.artistId !== artistId), ...newBlocks],
      })),
      getBlocksByDJ: (artistId) => get().blocks.filter((b) => b.artistId === artistId),
    }),
    {
      name: 'nexgig:availability',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Draft Assignment Store ───────────────────────────────────────────────────

interface DraftAssignmentState {
  drafts: DraftAssignment[];
  // Add a DJ to a slot as a draft (multiple DJs allowed per slot)
  setDraft: (slotId: string, venueId: string, artistId: string, managerId: string) => void;
  // Remove a specific DJ's draft from a slot
  removeDraftByDJ: (slotId: string, artistId: string) => void;
  // Remove ALL drafts for a slot (legacy, used when deleting a slot)
  removeDraft: (slotId: string) => void;
  // Get first draft for a specific slot (legacy compat)
  getDraftBySlot: (slotId: string) => DraftAssignment | undefined;
  // Get ALL drafts for a specific slot
  getDraftsBySlot: (slotId: string) => DraftAssignment[];
  // Get all drafts for a manager
  getDraftsByManager: (managerId: string) => DraftAssignment[];
  // Get all drafts for a specific DJ (for counting)
  getDraftsByDJ: (artistId: string, managerId: string) => DraftAssignment[];
  // Count drafts per DJ for a manager (returns map artistId -> count)
  getDraftCountPerDJ: (managerId: string) => Record<string, number>;
  // Convert all drafts to real gig requests and clear them
  sendAllDrafts: (managerId: string, addBooking: (b: Booking) => void) => { sent: number; skipped: number };
  // Convert only specific drafts (by slotId) to gig requests
  sendDraftsBySlotIds: (slotIds: string[], managerId: string, addBooking: (b: Booking) => void) => { sent: number; skipped: number };
  // Send a single draft for a specific artist on a specific slot
  sendDraftByDJ: (slotId: string, artistId: string, managerId: string, addBooking: (b: Booking) => void) => string | undefined;
  // Clear all drafts for a manager
  clearAllDrafts: (managerId: string) => void;
}

export const useDraftStore = create<DraftAssignmentState>()(
  persist(
    (set, get) => ({
  drafts: [],
  setDraft: (slotId, venueId, artistId, managerId) => set((state) => {
    // If this DJ is already drafted for this slot, do nothing (no duplicates)
    const alreadyExists = state.drafts.find((d) => d.slotId === slotId && d.artistId === artistId);
    if (alreadyExists) return state;
    const now = new Date().toISOString();
    return {
      drafts: [
        ...state.drafts,
        { id: 'draft-' + Date.now() + '-' + artistId, slotId, venueId, artistId, managerId, createdAt: now, updatedAt: now },
      ],
    };
  }),
  removeDraftByDJ: (slotId, artistId) => set((state) => ({
    drafts: state.drafts.filter((d) => !(d.slotId === slotId && d.artistId === artistId)),
  })),
  removeDraft: (slotId) => set((state) => ({
    drafts: state.drafts.filter((d) => d.slotId !== slotId),
  })),
  getDraftBySlot: (slotId) => get().drafts.find((d) => d.slotId === slotId),
  getDraftsBySlot: (slotId) => get().drafts.filter((d) => d.slotId === slotId),
  getDraftsByManager: (managerId) => get().drafts.filter((d) => d.managerId === managerId),
  getDraftsByDJ: (artistId, managerId) => get().drafts.filter((d) => d.artistId === artistId && d.managerId === managerId),
  getDraftCountPerDJ: (managerId) => {
    const counts: Record<string, number> = {};
    get().drafts.filter((d) => d.managerId === managerId).forEach((d) => {
      counts[d.artistId] = (counts[d.artistId] ?? 0) + 1;
    });
    return counts;
  },
  sendAllDrafts: (managerId, addBooking) => {
    const drafts = get().drafts.filter((d) => d.managerId === managerId);
    let sent = 0;
    let skipped = 0;
    drafts.forEach((draft) => {
      const booking: Booking = {
  id: generateUUID(),
        slotId: draft.slotId,
        venueId: draft.venueId,
        artistId: draft.artistId,
        managerId: draft.managerId,
        status: 'requested',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addBooking(booking);
      sent++;
    });
    set((state) => ({
      drafts: state.drafts.filter((d) => d.managerId !== managerId),
    }));
    return { sent, skipped };
  },
  sendDraftsBySlotIds: (slotIds, managerId, addBooking) => {
    const ids = new Set(slotIds);
    const drafts = get().drafts.filter((d) => d.managerId === managerId && ids.has(d.slotId));
    let sent = 0;
    const skipped = 0;
    drafts.forEach((draft) => {
      const booking: Booking = {
  id: generateUUID(),
        slotId: draft.slotId,
        venueId: draft.venueId,
        artistId: draft.artistId,
        managerId: draft.managerId,
        status: 'requested',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addBooking(booking);
      sent++;
    });
    set((state) => ({
      drafts: state.drafts.filter((d) => !(d.managerId === managerId && ids.has(d.slotId))),
    }));
    return { sent, skipped };
  },
  sendDraftByDJ: (slotId, artistId, managerId, addBooking) => {
    const draft = get().drafts.find((d) => d.slotId === slotId && d.artistId === artistId && d.managerId === managerId);
    if (!draft) return undefined;
    const booking: Booking = {
  id: generateUUID(),
      slotId: draft.slotId,
      venueId: draft.venueId,
      artistId: draft.artistId,
      managerId: draft.managerId,
      status: 'requested',
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addBooking(booking);
    set((state) => ({
      drafts: state.drafts.filter((d) => !(d.slotId === slotId && d.artistId === artistId)),
    }));
    return booking.id;
  },
  clearAllDrafts: (managerId) => set((state) => ({
    drafts: state.drafts.filter((d) => d.managerId !== managerId),
  })),
}),
    {
      name: 'nexgig:drafts',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Notification Store ─────────────────────────────────────────────────────────

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (notif: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: (userId: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  getByUser: (userId: string) => AppNotification[];
  getUnreadCount: (userId: string) => number;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      addNotification: (notif) => {
        // Auto-fix non-UUID IDs so Supabase never rejects them
        const genUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notif.id);
        const safeNotif = isUUID ? notif : { ...notif, id: genUUID() };
        set((state) => ({ notifications: [safeNotif, ...state.notifications] }));
        // Sync to Supabase via the create-notification Edge Function.
        // (Direct table writes are blocked by RLS; only the service role may insert.)
        supabase.functions.invoke('create-notification', {
          body: {
            id: safeNotif.id,
            user_id: safeNotif.userId,
            type: safeNotif.type,
            title: safeNotif.title,
            body: safeNotif.body,
            is_read: safeNotif.isRead ?? false,
            related_id: safeNotif.relatedId ?? null,
            related_type: safeNotif.relatedType ?? null,
            created_at: safeNotif.createdAt,
          },
        }).then(({ error }) => {
          if (error) console.warn('notification sync error:', error.message);
        });
      },
      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
        }));
        supabase.from('notifications').update({ is_read: true }).eq('id', id).then(() => {});
      },
      markAllAsRead: (userId) => {
        set((state) => ({
          notifications: state.notifications.map((n) => n.userId === userId ? { ...n, isRead: true } : n),
        }));
        supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).then(() => {});
      },
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
      clearNotifications: () => set({ notifications: [] }),
      getByUser: (userId) => get().notifications.filter((n) => n.userId === userId).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      getUnreadCount: (userId) => get().notifications.filter((n) => n.userId === userId && !n.isRead).length,
    }),
    {
      name: 'nexgig:notifications',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Network Tab Last-Viewed Store ────────────────────────────────────────────
// Tracks when the artist last opened the Network tab, per user, so we can show a
// dot when a manager has added them (or accepted an application) since then —
// without marking the underlying notifications as read.

interface NetworkSeenState {
  lastSeen: Record<string, string>; // userId -> ISO timestamp
  markNetworkSeen: (userId: string) => void;
  getLastSeen: (userId: string) => string | undefined;
}

export const useNetworkSeenStore = create<NetworkSeenState>()(
  persist(
    (set, get) => ({
      lastSeen: {},
      markNetworkSeen: (userId) => set((state) => ({
        lastSeen: { ...state.lastSeen, [userId]: new Date().toISOString() },
      })),
      getLastSeen: (userId) => get().lastSeen[userId],
    }),
    {
      name: 'nexgig:network-seen',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Booking Status Filter Store ──────────────────────────────────────────────
// Per-user toggles for which statuses show in the dashboard "Bookings" section
// (pending / confirmed / completed). Persisted so the choice survives restarts.
// Default: all three on. Used by both the manager and artist dashboards.

export interface BookingFilter {
  pending: boolean;
  confirmed: boolean;
  completed: boolean;
}

const DEFAULT_BOOKING_FILTER: BookingFilter = { pending: true, confirmed: true, completed: true };

interface BookingFilterState {
  filters: Record<string, BookingFilter>; // userId -> filter
  getFilter: (userId: string) => BookingFilter;
  setFilter: (userId: string, key: keyof BookingFilter, value: boolean) => void;
}

export const useBookingFilterStore = create<BookingFilterState>()(
  persist(
    (set, get) => ({
      filters: {},
      getFilter: (userId) => get().filters[userId] ?? DEFAULT_BOOKING_FILTER,
      setFilter: (userId, key, value) => set((state) => {
        const current = state.filters[userId] ?? DEFAULT_BOOKING_FILTER;
        return { filters: { ...state.filters, [userId]: { ...current, [key]: value } } };
      }),
    }),
    {
      name: 'nexgig:booking-filter',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Manager Profile Invoices Last-Seen Store ─────────────────────────────────
// Tracks when the manager last opened the Profile tab, per user, so the Profile
// tab can show a badge when new invoices have arrived since then. This is
// independent of each invoice's own read state (the per-invoice red dot clears
// separately when the manager opens that invoice).

interface ProfileInvoicesSeenState {
  lastSeen: Record<string, string>; // userId -> ISO timestamp
  markProfileInvoicesSeen: (userId: string) => void;
  getProfileInvoicesSeen: (userId: string) => string | undefined;
}

export const useProfileInvoicesSeenStore = create<ProfileInvoicesSeenState>()(
  persist(
    (set, get) => ({
      lastSeen: {},
      markProfileInvoicesSeen: (userId) => set((state) => ({
        lastSeen: { ...state.lastSeen, [userId]: new Date().toISOString() },
      })),
      getProfileInvoicesSeen: (userId) => get().lastSeen[userId],
    }),
    {
      name: 'nexgig:profile-invoices-seen',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Pending Applications Count (manager Network badge) ─────────────────────
// Live count of pending join requests for the manager's Network tab badge.
// Not persisted — it's a transient live value. The Network screen keeps it in
// sync with its applications list so accept/decline clears the badge instantly
// (no dependence on Supabase realtime firing).
interface PendingAppsState {
  count: number;
  setCount: (n: number) => void;
}

export const usePendingAppsStore = create<PendingAppsState>((set) => ({
  count: 0,
  setCount: (n) => set({ count: n }),
}));

// ─── Artist Directory Store ───────────────────────────────────────────────────
// In-memory cache of the public artist directory (name/photo/bio/genre/links/rate/etc.),
// populated when the Network → Artists list loads. Lets the artist profile screen open
// COMPLETE on the first frame (no fetch-on-open second pass) for any artist the manager
// has already browsed — the data is in hand before the tap. Not persisted: it's a session
// cache that the Network list refreshes.
interface ArtistDirectoryState {
  entries: Record<string, { user: User; profile: ArtistProfile }>;
  setArtists: (list: { user: User; profile: ArtistProfile }[]) => void;
  getArtist: (id: string) => { user: User; profile: ArtistProfile } | undefined;
}

export const useArtistDirectoryStore = create<ArtistDirectoryState>((set, get) => ({
  entries: {},
  setArtists: (list) => set((state) => ({ entries: { ...state.entries, ...Object.fromEntries(list.map((e) => [e.user.id, e])) } })),
  getArtist: (id) => get().entries[id],
}));

// ─── Venue Directory Store ────────────────────────────────────────────────────
// Cache of full Venue objects, populated when venue lists load (Network venues tab,
// etc.). Lets venue-detail open COMPLETE on the first frame (no fetch-on-open second
// pass), and lets Network paint instantly instead of blocking on the fetch.
// PERSISTED (see the store below) — it used to be a session-only cache, which is why
// Network sat on a spinner every cold start.

// Maps a raw Supabase `venues` row to a full Venue. Shared by venue-detail (artist +
// manager) and the list screens that seed the directory, so the mapping never diverges.
export function mapVenueRow(data: any): Venue {
  return {
    id: data.id,
    managerId: data.manager_id,
    name: data.name,
    venueType: data.venue_type,
    googleMapsLocation: { address: data.address ?? '', lat: data.lat ?? 0, lng: data.lng ?? 0, placeId: data.place_id ?? undefined },
    capacity: data.capacity ?? undefined,
    vibeDescription: data.vibe_description ?? undefined,
    preferredEnergy: Array.isArray(data.preferred_energy) ? data.preferred_energy : [],
    genrePreferences: Array.isArray(data.genre_preferences) ? data.genre_preferences : [],
    audienceType: Array.isArray(data.audience_type) ? data.audience_type : [],
    subVibe: Array.isArray(data.sub_vibe) ? data.sub_vibe : [],
    rulesTemplate: data.rules_template ?? undefined,
    instagramUrl: data.instagram_url ?? undefined,
    musicLink: data.music_link ?? undefined,
    color: data.color ?? '#2563EB',
    isHidden: data.is_hidden ?? false,
    isComplete: data.is_complete ?? true,
    verificationStatus: data.verification_status ?? 'pending',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as Venue;
}

// Resolve which photo a venue card should show: the manager's uploaded photo
// takes priority; if there is none, fall back to the admin-curated photo; if
// neither, return undefined so the caller renders its icon placeholder.


interface VenueDirectoryState {
  venues: Record<string, Venue>;
  setVenues: (list: Venue[]) => void;
  getVenue: (id: string) => Venue | undefined;
  listVenues: () => Venue[];
}

/**
 * The public venue directory — every non-deleted venue, used by both Network tabs.
 *
 * PERSISTED on purpose. This used to be the one store in this file created without
 * `persist`, so it started empty every launch and Network had nothing to show while it
 * waited on the network — a blank spinner for however long the request took (reported
 * at ~30s). The directory is tiny (a handful of venues), so it belongs on disk: render
 * what we had instantly, refresh underneath. See the Network screens' `venuesLoading`,
 * which now only blocks when the cache is genuinely empty (first ever launch).
 */
export const useVenueDirectoryStore = create<VenueDirectoryState>()(
  persist(
    (set, get) => ({
      venues: {},
      /**
       * REPLACES the directory — pass the complete visible-venue list, not a subset.
       *
       * This used to merge (`{...state.venues, ...new}`), which was harmless while the
       * store was memory-only. Persisted, merging leaks: deleting a venue just stops it
       * coming back from the fetch, so a merge would keep the stale copy on disk forever
       * and it would keep appearing in Network. Both callers (the two Network fetches)
       * pass the full list, so replacing is correct.
       */
      setVenues: (list) => set({ venues: Object.fromEntries(list.map((v) => [v.id, v])) }),
      getVenue: (id) => get().venues[id],
      listVenues: () => Object.values(get().venues),
    }),
    {
      name: 'nexgig:venue-directory',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ venues: state.venues }) as any,
    }
  )
);

// ─── Calendar Jump Store ──────────────────────────────────────────────────────
// Used by booking detail screens to tell the Calendar tab to jump to a specific date.

interface CalendarJumpState {
  pendingDate: string | null; // ISO date string 'YYYY-MM-DD', or null if no jump pending
  setPendingDate: (date: string | null) => void;
}

export const useCalendarJumpStore = create<CalendarJumpState>((set) => ({
  pendingDate: null,
  setPendingDate: (date) => set({ pendingDate: date }),
}));

// ─── Booking Review Store ─────────────────────────────────────────────────────

import type { BookingReview } from './types';

interface ReviewState {
  reviews: BookingReview[];
  addReview: (review: BookingReview) => void;
  getReviewByBooking: (bookingId: string) => BookingReview | undefined;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      reviews: [],
      addReview: (review) => set((state) => ({ reviews: [...state.reviews, review] })),
      getReviewByBooking: (bookingId) => get().reviews.find((r) => r.bookingId === bookingId),
    }),
    {
      name: 'nexgig:reviews',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Invoice Store ──────────────────────────────────────────────────────────

// Persisted set of invoice IDs the manager has opened. Kept SEPARATE from the
// invoice store so it survives sign-out (resetAllStores does not clear it).
// This is what makes the per-invoice "unread" red dot stay cleared across
// sign-out / sign-in, since the invoice store itself is wiped on sign-out and
// reloaded from Supabase (which doesn't track manager read-state).
interface InvoiceReadState {
  readIds: Record<string, true>;
  markRead: (id: string) => void;
  isRead: (id: string) => boolean;
}

export const useInvoiceReadStore = create<InvoiceReadState>()(
  persist(
    (set, get) => ({
      readIds: {},
      markRead: (id) => set((s) => ({ readIds: { ...s.readIds, [id]: true } })),
      isRead: (id) => !!get().readIds[id],
    }),
    {
      name: 'nexgig:invoice-read',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

interface InvoiceState {
  invoices: Invoice[];
  addInvoice: (invoice: Invoice) => void;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => void;
  cancelInvoice: (id: string) => void;
  markInvoiceReadByManager: (id: string) => void;
  deleteInvoice: (id: string) => void;
  getByArtist: (artistId: string) => Invoice[];
  getByManager: (managerId: string) => Invoice[];
  getByVenueAndArtist: (venueId: string, artistId: string) => Invoice[];
}

export const useInvoiceStore = create<InvoiceState>()(
  persist(
    (set, get) => ({
      invoices: [],
      addInvoice: (invoice) => set((state) => ({
        invoices: [
          // Re-apply persisted manager read-state so a previously-opened invoice
          // doesn't show the unread dot again after sign-out/in.
          { ...invoice, isReadByManager: invoice.isReadByManager || useInvoiceReadStore.getState().isRead(invoice.id) },
          ...state.invoices,
        ],
      })),
      updateInvoiceStatus: (id, status) => set((state) => ({
        invoices: state.invoices.map((inv) => inv.id === id ? { ...inv, status } : inv),
      })),
      // Soft-cancel: flip status to 'cancelled' locally AND persist to Supabase so
      // both sides see it cancelled. The gigs on a cancelled invoice free up again
      // because the invoiced-booking-id calc excludes cancelled invoices.
      cancelInvoice: (id) => {
        set((state) => ({
          invoices: state.invoices.map((inv) => inv.id === id ? { ...inv, status: 'cancelled' as InvoiceStatus } : inv),
        }));
        void supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id).then(({ error }) => {
          if (error) console.warn('cancelInvoice sync error:', error.message);
        });
      },
      markInvoiceReadByManager: (id) => {
        useInvoiceReadStore.getState().markRead(id);
        set((state) => ({
          invoices: state.invoices.map((inv) => inv.id === id ? { ...inv, isReadByManager: true } : inv),
        }));
      },
      deleteInvoice: (id) => set((state) => ({
        invoices: state.invoices.map((inv) => inv.id === id ? { ...inv, isDeletedByManager: true } : inv),
      })),
      getByArtist: (artistId) => get().invoices
        .filter((inv) => inv.artistId === artistId)
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
      getByManager: (managerId) => get().invoices
        .filter((inv) => inv.managerId === managerId)
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
      getByVenueAndArtist: (venueId, artistId) => get().invoices
        .filter((inv) => inv.venueId === venueId && inv.artistId === artistId)
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    }),
    {
      name: 'nexgig:invoices',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Load notifications from Supabase (call on sign-in) ────────────────────
export async function loadNotificationsFromSupabase(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return;
  const store = useNotificationStore.getState();
  const existingIds = new Set(store.notifications.map((n) => n.id));
  const newNotifs = data
    .filter((n: any) => !existingIds.has(n.id))
    .map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.is_read ?? false,
      relatedId: n.related_id ?? undefined,
      relatedType: n.related_type ?? undefined,
      createdAt: n.created_at,
    }));
  if (newNotifs.length > 0) {
    // Add directly to state without re-syncing to Supabase
    useNotificationStore.setState((state) => ({
      notifications: [...newNotifs, ...state.notifications],
    }));
  }
}

// ─── Global Reset (call on sign out) ────────────────────────────────────────
export function resetAllStores() {
  useVenueStore.getState().clearVenues();
  useSlotStore.getState().clearSlots();
  useBookingStore.getState().clearBookings();
  useLineupStore.getState().clearGlobalLineup();
  useLineupStore.getState().clearArtistUsers();
  useLineupStore.setState({ venueAssignments: [], lineups: [] });
  // NOTE: drafts are intentionally NOT cleared here. They persist per-device and
  // are scoped by managerId everywhere they're read, so a different manager signing
  // in never sees them, and the original manager gets them back on return.
  useAvailabilityStore.setState({ blocks: [] });
  useInvoiceStore.setState({ invoices: [] });
  useNotificationStore.getState().clearNotifications();
  // NOTE: invoice reminders are intentionally NOT cleared here (like drafts). They
  // persist per-device and every entry is scoped by artistId, so another user signing
  // in never sees them, and the original user keeps their chosen reminder day across
  // sign-out/sign-in. (Reminders are device-local; not synced to Supabase.)
  useCalendarJumpStore.setState({ pendingDate: null });
}

interface InvoiceReminderEntry {
  venueId: string;
  artistId: string;
  reminderDay: number; // 1-28
}

interface InvoiceReminderState {
  reminders: InvoiceReminderEntry[];
  setReminder: (venueId: string, artistId: string, day: number) => void;
  getReminder: (venueId: string, artistId: string) => number;
}

export const useInvoiceReminderStore = create<InvoiceReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],
      setReminder: (venueId, artistId, day) => set((state) => {
        const existing = state.reminders.findIndex((r) => r.venueId === venueId && r.artistId === artistId);
        if (existing >= 0) {
          const updated = [...state.reminders];
          updated[existing] = { venueId, artistId, reminderDay: day };
          return { reminders: updated };
        }
        return { reminders: [...state.reminders, { venueId, artistId, reminderDay: day }] };
      }),
      getReminder: (venueId, artistId) => {
        const entry = get().reminders.find((r) => r.venueId === venueId && r.artistId === artistId);
        return entry?.reminderDay ?? 28; // default to the 28th (max safe day — every month has it)
      },
    }),
    {
      name: 'nexgig:invoice-reminders',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
