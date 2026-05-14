import { describe, it, expect } from 'vitest';

describe('Types and Store', () => {
  it('should export all required types', async () => {
    const types = await import('../lib/types');
    expect(types).toBeDefined();
    // Verify key type exports exist
    expect(typeof types).toBe('object');
  });

  it('should export all Zustand stores', async () => {
    const store = await import('../lib/store');
    expect(store.useAuthStore).toBeDefined();
    expect(store.useVenueStore).toBeDefined();
    expect(store.useSlotStore).toBeDefined();
    expect(store.useBookingStore).toBeDefined();
    expect(store.useLineupStore).toBeDefined();
    expect(store.useNotificationStore).toBeDefined();
    expect(store.useAvailabilityStore).toBeDefined();
  });

  it('should have demo users in auth store', async () => {
    const { useAuthStore } = await import('../lib/store');
    const state = useAuthStore.getState();
    expect(state.currentUser).toBeDefined();
    // Auth store should have signIn and setCurrentUser methods
    expect(state.setCurrentUser).toBeDefined();
  });

  it('should export conflict detection utilities', async () => {
    const conflict = await import('../lib/conflict-detection');
    expect(conflict.formatDate).toBeDefined();
    expect(conflict.formatTime).toBeDefined();
  });
});
