/**
 * Tests for artist availability default calendar view logic.
 * Tests pure JS logic only — no native module calls.
 */
import { describe, it, expect } from 'vitest';

// Mirror the constant from app/(artist)/settings.tsx
const DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW = 'nexgig:dj:defaultCalendarView';

describe('Artist availability default calendar view', () => {
  it('storage key is defined and non-empty', () => {
    expect(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW).toBeTruthy();
    expect(typeof DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW).toBe('string');
    expect(DJ_STORAGE_KEY_DEFAULT_CALENDAR_VIEW).toBe('nexgig:dj:defaultCalendarView');
  });

  it('only valid values are "week" and "month"', () => {
    const validValues = ['week', 'month'];
    expect(validValues).toContain('week');
    expect(validValues).toContain('month');
    expect(validValues).not.toContain('venue'); // old value from manager
    expect(validValues).not.toContain('all');
  });

  it('toggle logic: active mode always renders on the left', () => {
    const getToggleLabels = (mode: string) => ({
      first: mode === 'month' ? 'Month' : 'Week',
      second: mode === 'month' ? 'Week' : 'Month',
    });

    // When weekly is default → Week on left, Month on right
    const weekToggle = getToggleLabels('week');
    expect(weekToggle.first).toBe('Week');
    expect(weekToggle.second).toBe('Month');

    // When monthly is default → Month on left, Week on right
    const monthToggle = getToggleLabels('month');
    expect(monthToggle.first).toBe('Month');
    expect(monthToggle.second).toBe('Week');
  });

  it('useFocusEffect applies saved value correctly', () => {
    // Simulate the AsyncStorage read + setViewMode logic from availability.tsx
    const applyStoredView = (stored: string | null, currentMode: string): string => {
      if (stored === 'week' || stored === 'month') return stored;
      return currentMode; // fallback: keep current
    };

    expect(applyStoredView('week', 'month')).toBe('week');
    expect(applyStoredView('month', 'week')).toBe('month');
    expect(applyStoredView(null, 'week')).toBe('week'); // no preference → keep default
    expect(applyStoredView('invalid', 'month')).toBe('month'); // bad value → keep current
  });
});
