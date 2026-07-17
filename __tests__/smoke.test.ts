/**
 * Smoke test — high-level health check of the core app logic.
 *
 * Runs in plain Node (vitest). It mocks the only two React-Native-specific
 * modules the store touches — AsyncStorage and the Supabase client — so the
 * Zustand stores can be imported and exercised without a device or network.
 *
 * Covers: store wiring, venue / slot / booking / draft / lineup reducers,
 * the slot-delete cascade (requests + confirmed bookings get cancelled and
 * the affected artists get notified), conflict detection (including the
 * overnight-wrap case and the self-slot skip), time helpers, and
 * resetAllStores.
 *
 * If this file fails to import, it almost always means a new runtime import
 * was added to lib/store.ts that needs mocking here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// In-memory AsyncStorage. zustand's persist middleware calls getItem on init.
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
    },
  };
});

// Universal chainable Supabase stub. Every property access returns the same
// callable proxy, and calling it returns the proxy too — so any shape works,
// e.g. `supabase.from('x').upsert(...)`, `supabase.functions.invoke(...)`,
// `supabase.auth.getUser()`. `.then()` resolves to { data: [], error: null }
// so fire-and-forget writes inside the store never hit the network.
vi.mock('../lib/supabase', () => {
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: any) => resolve({ data: [], error: null });
      return proxy;
    },
    apply() { return proxy; },
  });
  return { supabase: proxy };
});

// Imported after the mocks above (vitest hoists vi.mock).
import * as store from '../lib/store';
import * as conflict from '../lib/conflict-detection';
import * as utils from '../lib/utils';
import type { Venue, Booking } from '../lib/types';

// ─── Builders ────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function makeVenue(id: string, overrides: Partial<Venue> = {}): Venue {
  return {
    id,
    managerId: 'mgr-1',
    name: `Venue ${id}`,
    venueType: 'Lounge',
    googleMapsLocation: { lat: 0, lng: 0, address: 'Dubai' },
    preferredEnergy: [],
    genrePreferences: [],
    photoUrls: [],
    color: '#2563EB',
    isHidden: false,
    isComplete: true,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeSlot(id: string, venueId: string, date: string, startTime: string, endTime: string) {
  return { id, venueId, date, name: 'Night', startTime, endTime, createdAt: now() } as any;
}

function makeBooking(id: string, slotId: string, venueId: string, artistId: string, status: Booking['status']): Booking {
  return {
    id, slotId, venueId, artistId,
    managerId: 'mgr-1',
    status,
    isCompleted: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

// ─── Reset all relevant stores before each test ───────────────────────────────

beforeEach(() => {
  store.resetAllStores();
  store.useNotificationStore.setState({ notifications: [] });
  store.useAuthStore.setState({ currentUser: null, isAuthenticated: false });
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Smoke: store wiring', () => {
  it('exports every store', () => {
    expect(store.useAuthStore).toBeDefined();
    expect(store.useVenueStore).toBeDefined();
    expect(store.useSlotStore).toBeDefined();
    expect(store.useBookingStore).toBeDefined();
    expect(store.useLineupStore).toBeDefined();
    expect(store.useDraftStore).toBeDefined();
    expect(store.useNotificationStore).toBeDefined();
    expect(store.useAvailabilityStore).toBeDefined();
    expect(store.useInvoiceStore).toBeDefined();
    expect(typeof store.resetAllStores).toBe('function');
  });
});

describe('Smoke: venue store', () => {
  it('adds, updates, hides, unhides and deletes a venue', () => {
    const v = store.useVenueStore.getState();
    v.addVenue(makeVenue('v1', { name: 'Limonata' }));
    expect(store.useVenueStore.getState().venues).toHaveLength(1);
    expect(store.useVenueStore.getState().getVenueName('v1')).toBe('Limonata');

    v.updateVenue('v1', { name: 'Lucias' });
    expect(store.useVenueStore.getState().getVenueName('v1')).toBe('Lucias');

    v.hideVenue('v1');
    expect(store.useVenueStore.getState().getVenueById('v1')?.isHidden).toBe(true);
    v.unhideVenue('v1');
    expect(store.useVenueStore.getState().getVenueById('v1')?.isHidden).toBe(false);

    v.deleteVenue('v1');
    expect(store.useVenueStore.getState().venues).toHaveLength(0);
  });
});

describe('Smoke: slot store + delete cascade', () => {
  it('deleting a slot cancels its requested & confirmed bookings and notifies the artists', () => {
    store.useVenueStore.getState().addVenue(makeVenue('v1', { name: 'Yubi' }));
    store.useSlotStore.getState().addSlot(makeSlot('s1', 'v1', '2026-07-01', '21:00', '01:00'));
    store.useBookingStore.getState().addBooking(makeBooking('b-req', 's1', 'v1', 'art-1', 'requested'));
    store.useBookingStore.getState().addBooking(makeBooking('b-conf', 's1', 'v1', 'art-2', 'confirmed'));

    store.useSlotStore.getState().deleteSlot('s1');

    // Slot is gone
    expect(store.useSlotStore.getState().getSlotById('s1')).toBeUndefined();

    const bookings = store.useBookingStore.getState().bookings;
    const req = bookings.find((b) => b.id === 'b-req')!;
    const conf = bookings.find((b) => b.id === 'b-conf')!;

    // Requested → cancelled as a request (hidden from artist), snapshot kept
    expect(req.status).toBe('cancelled');
    expect(req.cancelledAsRequest).toBe(true);
    expect(req.venueName).toBe('Yubi');

    // Confirmed → cancelled with a reason
    expect(conf.status).toBe('cancelled');
    expect(conf.cancellationReason).toContain('deleted');

    // Both affected artists were notified
    expect(store.useNotificationStore.getState().getByUser('art-1').length).toBeGreaterThan(0);
    expect(store.useNotificationStore.getState().getByUser('art-2').length).toBeGreaterThan(0);
  });
});

describe('Smoke: booking store', () => {
  it('transitions status and stamps confirmedAt / cancelledAt', () => {
    const b = store.useBookingStore.getState();
    b.addBooking(makeBooking('b1', 's1', 'v1', 'art-1', 'requested'));

    b.updateBookingStatus('b1', 'confirmed');
    expect(store.useBookingStore.getState().bookings[0].status).toBe('confirmed');
    expect(store.useBookingStore.getState().bookings[0].confirmedAt).toBeTruthy();

    b.updateBookingStatus('b1', 'cancelled');
    expect(store.useBookingStore.getState().bookings[0].cancelledAt).toBeTruthy();
  });

  it('getBookingBySlot ignores cancelled/declined; getBookingsBySlot hides manager-hidden', () => {
    const b = store.useBookingStore.getState();
    b.addBooking(makeBooking('b1', 's1', 'v1', 'art-1', 'cancelled'));
    b.addBooking(makeBooking('b2', 's1', 'v1', 'art-2', 'confirmed'));

    expect(store.useBookingStore.getState().getBookingBySlot('s1')?.id).toBe('b2');

    b.hideFromManagerCalendar('b2');
    expect(store.useBookingStore.getState().getBookingsBySlot('s1').find((x) => x.id === 'b2')).toBeUndefined();
  });
});

describe('Smoke: draft store', () => {
  it('drafts dedupe and convert to requested bookings on send', () => {
    const d = store.useDraftStore.getState();
    d.setDraft('s1', 'v1', 'art-1', 'mgr-1');
    d.setDraft('s1', 'v1', 'art-1', 'mgr-1'); // duplicate, ignored
    expect(store.useDraftStore.getState().getDraftsByManager('mgr-1')).toHaveLength(1);

    const addBooking = store.useBookingStore.getState().addBooking;
    const result = store.useDraftStore.getState().sendAllDrafts('mgr-1', addBooking);

    expect(result.sent).toBe(1);
    expect(store.useDraftStore.getState().getDraftsByManager('mgr-1')).toHaveLength(0);
    const created = store.useBookingStore.getState().bookings;
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('requested');
  });
});

describe('Smoke: lineup store', () => {
  it('adds to global lineup (no dupes), assigns to venue, and removes cascade', () => {
    const l = store.useLineupStore.getState();
    const entry = { id: 'gl1', managerId: 'mgr-1', artistId: 'art-1', status: 'active' as const, addedAt: now() };
    l.addToGlobalLineup(entry);
    l.addToGlobalLineup(entry); // duplicate, ignored
    expect(store.useLineupStore.getState().getGlobalLineupByManager('mgr-1')).toHaveLength(1);
    expect(store.useLineupStore.getState().isOnGlobalLineup('mgr-1', 'art-1')).toBe(true);

    l.assignToVenue({ id: 'va1', globalLineupId: 'gl1', venueId: 'v1', artistId: 'art-1', assignedAt: now(), status: 'active' });
    expect(store.useLineupStore.getState().getVenuesForArtist('art-1')).toEqual(['v1']);

    l.removeFromGlobalLineup('art-1');
    expect(store.useLineupStore.getState().isOnGlobalLineup('mgr-1', 'art-1')).toBe(false);
    expect(store.useLineupStore.getState().getVenuesForArtist('art-1')).toHaveLength(0);
  });
});

describe('Smoke: conflict detection', () => {
  it('timesOverlap handles same-day, no-overlap, touching and overnight wrap', () => {
    expect(conflict.timesOverlap('21:00', '23:00', '22:00', '23:30', '2026-06-01', '2026-06-01')).toBe(true);
    expect(conflict.timesOverlap('20:00', '21:00', '21:00', '22:00', '2026-06-01', '2026-06-01')).toBe(false); // touching
    expect(conflict.timesOverlap('21:00', '23:00', '22:00', '23:30', '2026-06-01', '2026-06-02')).toBe(false); // diff date
    expect(conflict.timesOverlap('22:00', '02:00', '23:00', '23:30', '2026-06-01', '2026-06-01')).toBe(true); // overnight
  });

  it('timesOverlap catches an overnight set clashing with the NEXT day', () => {
    // 1 Jun 22:00–03:00 runs until 03:00 on 2 Jun, so it collides with a 2 Jun
    // 01:00–04:00 gig between 01:00 and 03:00 — the double-booking case.
    expect(conflict.timesOverlap('22:00', '03:00', '01:00', '04:00', '2026-06-01', '2026-06-02')).toBe(true);
    // Same pair, arguments swapped — overlap is symmetric.
    expect(conflict.timesOverlap('01:00', '04:00', '22:00', '03:00', '2026-06-02', '2026-06-01')).toBe(true);
    // The 20:00–00:00 default ends exactly at midnight: touches, does not overlap.
    expect(conflict.timesOverlap('20:00', '00:00', '00:00', '04:00', '2026-06-01', '2026-06-02')).toBe(false);
    // An overnight set does NOT reach a gig two days out.
    expect(conflict.timesOverlap('22:00', '03:00', '01:00', '04:00', '2026-06-01', '2026-06-03')).toBe(false);
    // Times arriving as HH:MM:SS must compare the same as HH:MM.
    expect(conflict.timesOverlap('22:00:00', '03:00:00', '01:00', '04:00', '2026-06-01', '2026-06-02')).toBe(true);
  });

  it('timesOverlap treats a zero-length slot as empty, not a 24h wrap', () => {
    expect(conflict.timesOverlap('21:00', '21:00', '20:00', '23:00', '2026-06-01', '2026-06-01')).toBe(false);
  });

  it('detectConflicts flags a booking on the previous day that runs past midnight', () => {
    const slot = makeSlot('s1', 'v1', '2026-06-02', '01:00', '04:00');
    const overnight = {
      ...makeBooking('b-prev', 's2', 'v1', 'art-1', 'confirmed'),
      slotDate: '2026-06-01', slotStartTime: '22:00', slotEndTime: '03:00',
    };

    const conflicts = conflict.detectConflicts(
      'art-1', slot, [overnight], [],
      () => 'Yubi', () => undefined
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('booking');
  });

  it('detectConflicts flags an overlapping booking but skips the same slot (no self-conflict)', () => {
    const slot = makeSlot('s1', 'v1', '2026-06-01', '21:00', '01:00');
    const overlapping = { ...makeBooking('b-other', 's2', 'v1', 'art-1', 'confirmed'), slotDate: '2026-06-01', slotStartTime: '22:00', slotEndTime: '23:00' };
    const self = { ...makeBooking('b-self', 's1', 'v1', 'art-1', 'requested'), slotDate: '2026-06-01', slotStartTime: '21:00', slotEndTime: '01:00' };

    const conflicts = conflict.detectConflicts(
      'art-1', slot, [overlapping, self], [],
      () => 'Yubi', () => undefined
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('booking');
  });

  it('formats dates, and times in both formats', () => {
    // formatTimeValue is the pure formatter — assert each format explicitly rather
    // than depending on whatever the store happens to hold.
    expect(conflict.formatTimeValue('21:30', '24h')).toBe('21:30');
    expect(conflict.formatTimeValue('21:30', '12h')).toBe('9:30 PM');
    expect(conflict.formatTimeValue('00:15', '12h')).toBe('12:15 AM');
    expect(conflict.formatTimeValue('00:15', '24h')).toBe('00:15');
    expect(conflict.formatDate('2026-06-01')).toContain('Jun');
  });

  it('formatTime follows the time-format setting (defaults to 24h)', () => {
    // Times are always STORED as 24h 'HH:MM'; this is display only, and the artist
    // can flip it in settings. The old test asserted 12h output against the 24h
    // default and had been failing on main.
    expect(conflict.formatTime('21:30')).toBe('21:30');
    conflict.useTimeFormatStore.getState().setFormat('12h');
    expect(conflict.formatTime('21:30')).toBe('9:30 PM');
    expect(conflict.formatTimeRange('21:30', '02:00')).toBe('9:30 PM – 2:00 AM');
    conflict.useTimeFormatStore.getState().setFormat('24h'); // restore — the store is module-level
  });
});

describe('Smoke: time utils', () => {
  it('builds comparable datetimes and classifies past/future', () => {
    expect(utils.slotDateTimeStr('2026-06-01', '21:00')).toBe('2026-06-01T21:00');
    expect(utils.isPastStart('2020-01-01', '10:00')).toBe(true);
    expect(utils.isUpcoming('2999-01-01', '10:00')).toBe(true);
  });

  // Nightlife gigs cross midnight and the app's own defaults (20:00–00:00, 21:00–01:00)
  // do. Without the day roll a 22:00–03:00 gig ends BEFORE it starts and completes
  // instantly on creation — which would fire the gig review mid-set.
  it('slotEndDateTimeStr rolls the date forward for overnight gigs', () => {
    expect(utils.slotEndDateTimeStr('2026-06-01', '22:00', '03:00')).toBe('2026-06-02T03:00');
    expect(utils.slotEndDateTimeStr('2026-06-01', '20:00', '00:00')).toBe('2026-06-02T00:00'); // the add-slot default
    expect(utils.slotEndDateTimeStr('2026-06-01', '21:00', '01:00')).toBe('2026-06-02T01:00'); // the calendar default
  });

  it('slotEndDateTimeStr leaves same-day gigs alone', () => {
    expect(utils.slotEndDateTimeStr('2026-06-01', '14:00', '18:00')).toBe('2026-06-01T18:00');
    expect(utils.slotEndDateTimeStr('2026-06-01', '00:00', '23:59')).toBe('2026-06-01T23:59'); // full-day private event
  });

  // end === start does NOT roll: a zero-length slot ends the moment it starts rather
  // than running 24h. timesOverlap() relies on this to treat it as covering no time.
  // supabase/complete-past-bookings.sql mirrors this (`et < st`) — keep them in step.
  it('slotEndDateTimeStr does not roll a zero-length slot', () => {
    expect(utils.slotEndDateTimeStr('2026-06-01', '20:00', '20:00')).toBe('2026-06-01T20:00');
  });

  it('slotEndDateTimeStr normalises HH:MM:SS times', () => {
    expect(utils.slotEndDateTimeStr('2026-06-01', '22:00:00', '03:00:00')).toBe('2026-06-02T03:00');
  });

  it('slotEndDateTimeStr rolls across month and year boundaries', () => {
    expect(utils.slotEndDateTimeStr('2026-06-30', '22:00', '03:00')).toBe('2026-07-01T03:00');
    expect(utils.slotEndDateTimeStr('2026-12-31', '22:00', '03:00')).toBe('2027-01-01T03:00');
  });

  it('slotEndDateTimeStr falls back to the start datetime when no end time is known', () => {
    // Booking.slotEndTime is optional — legacy rows keep the old start-based behaviour.
    expect(utils.slotEndDateTimeStr('2026-06-01', '21:00', undefined)).toBe('2026-06-01T21:00');
  });

  it('monthKey buckets by year-month', () => {
    expect(utils.monthKey('2026-06-15')).toBe('2026-06');
    // Same day number, different month — the DateBadge can't tell these apart, which
    // is the whole reason the dashboard needs a month separator.
    expect(utils.monthKey('2026-07-15')).not.toBe(utils.monthKey('2026-06-15'));
  });

  it('monthLabel drops the year in the current year and keeps it otherwise', () => {
    const thisYear = new Date().getFullYear();
    expect(utils.monthLabel(`${thisYear}-06-15`)).toBe('June');
    expect(utils.monthLabel(`${thisYear + 1}-01-03`)).toBe(`January ${thisYear + 1}`);
  });

  it('isPastEnd completes on end, not start', () => {
    expect(utils.isPastEnd('2020-01-01', '22:00', '03:00')).toBe(true);
    expect(utils.isPastEnd('2999-01-01', '22:00', '03:00')).toBe(false);
    // an overnight gig is NOT finished just because its start time has passed
    expect(utils.isPastStart('2999-01-01', '22:00')).toBe(false);
  });
});

describe('Smoke: resetAllStores', () => {
  it('clears venues, slots and bookings', () => {
    store.useVenueStore.getState().addVenue(makeVenue('v1'));
    store.useSlotStore.getState().addSlot(makeSlot('s1', 'v1', '2026-07-01', '21:00', '23:00'));
    store.useBookingStore.getState().addBooking(makeBooking('b1', 's1', 'v1', 'art-1', 'requested'));

    store.resetAllStores();

    expect(store.useVenueStore.getState().venues).toHaveLength(0);
    expect(store.useSlotStore.getState().slots).toHaveLength(0);
    expect(store.useBookingStore.getState().bookings).toHaveLength(0);
  });
});
