import { describe, it, expect, beforeEach } from 'vitest';

describe('Global Roster Types and Mock Data', () => {
  it('should have correct GlobalRosterEntry type structure', async () => {
    const { MOCK_GLOBAL_LINEUP } = await import('../lib/mock-data');
    expect(MOCK_GLOBAL_LINEUP).toBeDefined();
    expect(MOCK_GLOBAL_LINEUP.length).toBeGreaterThan(0);

    const entry = MOCK_GLOBAL_LINEUP[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('managerId');
    expect(entry).toHaveProperty('artistId');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('addedAt');
    expect(entry.status).toBe('active');
  });

  it('should have correct VenueAssignment type structure', async () => {
    const { MOCK_VENUE_ASSIGNMENTS } = await import('../lib/mock-data');
    expect(MOCK_VENUE_ASSIGNMENTS).toBeDefined();
    expect(MOCK_VENUE_ASSIGNMENTS.length).toBeGreaterThan(0);

    const assignment = MOCK_VENUE_ASSIGNMENTS[0];
    expect(assignment).toHaveProperty('id');
    expect(assignment).toHaveProperty('globalLineupId');
    expect(assignment).toHaveProperty('venueId');
    expect(assignment).toHaveProperty('artistId');
    expect(assignment).toHaveProperty('assignedAt');
    expect(assignment).toHaveProperty('status');
    expect(assignment.status).toBe('active');
  });

  it('should have all global roster DJs also in MOCK_ARTISTS', async () => {
    const { MOCK_GLOBAL_LINEUP, MOCK_ARTISTS } = await import('../lib/mock-data');
    const artistIds = MOCK_ARTISTS.map((d) => d.id);
    for (const entry of MOCK_GLOBAL_LINEUP) {
      expect(artistIds).toContain(entry.artistId);
    }
  });

  it('should have venue assignments that reference valid global roster entries', async () => {
    const { MOCK_GLOBAL_LINEUP, MOCK_VENUE_ASSIGNMENTS } = await import('../lib/mock-data');
    const grIds = MOCK_GLOBAL_LINEUP.map((r) => r.id);
    for (const assignment of MOCK_VENUE_ASSIGNMENTS) {
      expect(grIds).toContain(assignment.globalLineupId);
    }
  });

  it('should have venue assignments that reference valid venues', async () => {
    const { MOCK_VENUE_ASSIGNMENTS, MOCK_VENUES } = await import('../lib/mock-data');
    const venueIds = MOCK_VENUES.map((v) => v.id);
    for (const assignment of MOCK_VENUE_ASSIGNMENTS) {
      expect(venueIds).toContain(assignment.venueId);
    }
  });

  it('should have more venue assignments than global roster entries (DJs assigned to multiple venues)', async () => {
    const { MOCK_GLOBAL_LINEUP, MOCK_VENUE_ASSIGNMENTS } = await import('../lib/mock-data');
    expect(MOCK_VENUE_ASSIGNMENTS.length).toBeGreaterThan(MOCK_GLOBAL_LINEUP.length);
  });
});

describe('Global Roster Store', () => {
  it('should initialize with global roster and venue assignments', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    expect(state.globalLineup).toBeDefined();
    expect(state.globalLineup.length).toBeGreaterThan(0);
    expect(state.venueAssignments).toBeDefined();
    expect(state.venueAssignments.length).toBeGreaterThan(0);
  });

  it('getGlobalLineupByManager should return active entries for manager-1', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    const roster = state.getGlobalLineupByManager('manager-1');
    expect(roster.length).toBe(17); // 17 DJs in mock data
    roster.forEach((entry) => {
      expect(entry.managerId).toBe('manager-1');
      expect(entry.status).toBe('active');
    });
  });

  it('isOnGlobalLineup should return true for existing DJ', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    expect(state.isOnGlobalLineup('manager-1', 'dj-1')).toBe(true);
    expect(state.isOnGlobalLineup('manager-1', 'dj-999')).toBe(false);
  });

  it('getAssignmentsByVenue should return correct assignments', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    const venue1Assignments = state.getAssignmentsByVenue('venue-1');
    expect(venue1Assignments.length).toBe(17); // all DJs assigned to every venue
    venue1Assignments.forEach((a) => {
      expect(a.venueId).toBe('venue-1');
      expect(a.status).toBe('active');
    });
  });

  it('isArtistAssignedToVenue should check correctly', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    expect(state.isArtistAssignedToVenue('venue-1', 'dj-1')).toBe(true);
    expect(state.isArtistAssignedToVenue('venue-1', 'dj-4')).toBe(true); // all DJs assigned to all venues
  });

  it('getVenuesForArtist should return all venue IDs for a DJ', async () => {
    const { useLineupStore } = await import('../lib/store');
    const state = useLineupStore.getState();
    const venues = state.getVenuesForArtist('dj-1');
    expect(venues).toContain('venue-1');
    expect(venues).toContain('venue-2');
    expect(venues).toContain('venue-3');
    expect(venues.length).toBe(6); // 6 venues total
  });
});
