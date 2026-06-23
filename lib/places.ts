import { supabase } from './supabase';

// ─── UAE emirate display helper ──────────────────────────────────────────────
// Venue address lines from Google can be long (full street + district + city +
// country, sometimes with an Arabic duplicate). For card display we just want
// the emirate, e.g. "Dubai". This recognizes the 7 emirates anywhere in the
// string, so it works on both the new short addresses and any old long ones.
const UAE_EMIRATES = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain',
];

export function cityFromAddress(address?: string | null): string {
  if (!address) return '';
  const lower = address.toLowerCase();
  const found = UAE_EMIRATES.find((c) => lower.includes(c.toLowerCase()));
  if (found) return found;
  // Fallback: take the segment before the country (last is usually the country)
  const parts = address.split(/[-,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? address;
}

// ─── Google Places (New) helpers ─────────────────────────────────────────────
// These call the `places-proxy` Supabase Edge Function, which holds the API key
// server-side. supabase.functions.invoke automatically attaches the user's JWT,
// which is what the function's Verify-JWT gate checks.

export interface PlaceSuggestion {
  placeId: string;
  primary: string;   // main line, e.g. "February 30"
  secondary: string; // context line, e.g. "Dubai - United Arab Emirates"
  full: string;      // full text
}

export interface PlaceDetails {
  placeId: string;
  address: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

// A session token bundles the autocomplete keystrokes + the final details fetch
// into ONE billed session. Generate one when a search starts, reuse it through
// the detail tap, then start a fresh one for the next search.
export function newPlacesSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function placesAutocomplete(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const { data, error } = await supabase.functions.invoke('places-proxy', {
    body: { action: 'autocomplete', input, sessionToken },
  });
  if (error) {
    console.warn('placesAutocomplete error:', error.message);
    return [];
  }
  return (data?.suggestions ?? []) as PlaceSuggestion[];
}

export async function placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
  const { data, error } = await supabase.functions.invoke('places-proxy', {
    body: { action: 'details', placeId, sessionToken },
  });
  if (error || !data || data.error) {
    console.warn('placeDetails error:', error?.message ?? data?.error);
    return null;
  }
  return data as PlaceDetails;
}
