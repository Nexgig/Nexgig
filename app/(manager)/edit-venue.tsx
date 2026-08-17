import { useMemo, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert, Image } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { venueImage } from '@/lib/venue-images';
import { useColors } from '@/hooks/use-colors';
import type { VenueType, EnergyType, GenreType, AudienceType, SubVibe } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { supabase } from '@/lib/supabase';
import { placesAutocomplete, placeDetails, newPlacesSessionToken, type PlaceSuggestion } from '@/lib/places';

// ── Option arrays — kept in sync with create-venue.tsx ───────────────────────
const VENUE_TYPES: VenueType[] = [
  'Dance Club', 'Beach Club', 'Lounge', 'Cocktail Bar', 'Rooftop', 'Live Music Venue',
];
const VENUE_COLORS = [
  { hex: '#2563EB', label: 'Blue' },
  { hex: '#8B5CF6', label: 'Purple' },
  { hex: '#22C55E', label: 'Green' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#EF4444', label: 'Red' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#06B6D4', label: 'Cyan' },
  { hex: '#F97316', label: 'Orange' },
  { hex: '#14B8A6', label: 'Teal' },
  { hex: '#A855F7', label: 'Violet' },
];
const VENUE_ENERGY_OPTIONS = ['Low', 'High', 'Mixed'] as const;
type VenueEnergyOption = typeof VENUE_ENERGY_OPTIONS[number];
const GENRE_PREFS: GenreType[] = [
  'House', 'Tech House', 'Afro House', 'Melodic House & Techno', 'Techno',
  'Deep House', 'EDM / Commercial', 'Hip Hop / R&B', 'Open Format',
  'Afrobeats', 'Arabic', 'Latin', 'Amapiano',
  'Khaleeji', 'Pop / Top 40', 'Reggaeton', 'R&B/Soul', 'Dancehall',
  'Disco / Funk', '90s / 2000s', '80s',
];
const AUDIENCE_TYPES: AudienceType[] = [
  'Tourist-heavy', 'Local crowd', 'High-end / VIP', 'Mixed / casual', 'Corporate',
  'Party Crowd', 'Music Lovers', 'Neighbourhood Bar',
];
const SUB_VIBES: SubVibe[] = [
  'Melodic', 'Groovy', 'Underground', 'Commercial', 'High Energy',
  'Chill', 'Dark', 'Tribal', 'Percussive', 'Urban', 'Soul',
];

export default function EditVenueScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = useVenueStore((s) => s.getVenueById(id));
  const updateVenue = useVenueStore((s) => s.updateVenue);

  const [form, setForm] = useState({
    name: venue?.name ?? '',
    venueType: (venue?.venueType ?? 'Dance Club') as VenueType,
    address: venue?.googleMapsLocation?.address ?? '',
    capacity: venue?.capacity ?? '',
    vibeDescription: venue?.vibeDescription ?? '',
    preferredEnergy: (venue?.preferredEnergy ?? []) as unknown as VenueEnergyOption[],
    genrePreferences: (venue?.genrePreferences ?? []) as GenreType[],
    audienceType: (venue?.audienceType ?? []) as AudienceType[],
    subVibe: (venue?.subVibe ?? []) as SubVibe[],
    rulesTemplate: venue?.rulesTemplate ?? '',
    instagramUrl: venue?.instagramUrl ?? '',
    musicLink: venue?.musicLink ?? '',
    color: venue?.color ?? colors.primary,
    billingCompanyName: venue?.billing?.companyName ?? '',
    billingCompanyAddress: venue?.billing?.companyAddress ?? '',
    billingTrnNumber: venue?.billing?.trnNumber ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(
    venue?.googleMapsLocation && (venue.googleMapsLocation.lat || venue.googleMapsLocation.lng)
      ? { lat: venue.googleMapsLocation.lat, lng: venue.googleMapsLocation.lng }
      : null
  );
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(venue?.googleMapsLocation?.placeId ?? null);
  const [locationDirty, setLocationDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newPlacesSessionToken());

  // Track original values for change detection. Kept in state (not just refs) so that
  // resetting the baseline after a save actually re-triggers the hasChanges memo —
  // a ref mutation alone wouldn't, which left "unsaved changes" showing post-save.
  const originalForm = useRef({ ...form });
  // Bumped after every successful save so hasChanges recomputes against the new baseline.
  const [savedTick, setSavedTick] = useState(0);

  const hasChanges = useMemo(() => {
    const o = originalForm.current;
    return (
      form.name !== o.name ||
      form.venueType !== o.venueType ||
      form.address !== o.address ||
      form.capacity !== o.capacity ||
      form.vibeDescription !== o.vibeDescription ||
      form.rulesTemplate !== o.rulesTemplate ||
      form.instagramUrl !== o.instagramUrl ||
      form.musicLink !== o.musicLink ||
      form.color !== o.color ||
      JSON.stringify(form.preferredEnergy) !== JSON.stringify(o.preferredEnergy) ||
      JSON.stringify(form.genrePreferences) !== JSON.stringify(o.genrePreferences) ||
      JSON.stringify(form.audienceType) !== JSON.stringify(o.audienceType) ||
      JSON.stringify(form.subVibe) !== JSON.stringify(o.subVibe) ||
      form.billingCompanyName !== o.billingCompanyName ||
      form.billingCompanyAddress !== o.billingCompanyAddress ||
      form.billingTrnNumber !== o.billingTrnNumber
    );
  }, [form, savedTick]);

  const handleBack = () => {
    if (!hasChanges) { router.back(); return; }
    Alert.alert(
      'Unsaved Changes',
      'You have unsaved changes. Are you sure you want to discard them?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]
    );
  };

  if (!venue) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Venue not found</Text>
      </ScreenContainer>
    );
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleEnergy = (e: VenueEnergyOption) =>
    setForm((f) => ({
      ...f,
      preferredEnergy: f.preferredEnergy.includes(e)
        ? f.preferredEnergy.filter((x) => x !== e)
        : [...f.preferredEnergy, e],
    }));

  const toggleGenre = (g: GenreType) =>
    setForm((f) => ({
      ...f,
      genrePreferences: f.genrePreferences.includes(g)
        ? f.genrePreferences.filter((x) => x !== g)
        : [...f.genrePreferences, g],
    }));

  const toggleAudience = (a: AudienceType) =>
    setForm((f) => ({
      ...f,
      audienceType: f.audienceType.includes(a)
        ? f.audienceType.filter((x) => x !== a)
        : [...f.audienceType, a],
    }));

  const toggleSubVibe = (v: SubVibe) =>
    setForm((f) => ({
      ...f,
      subVibe: f.subVibe.includes(v)
        ? f.subVibe.filter((x) => x !== v)
        : [...f.subVibe, v],
    }));

  // ── Google Places address search ──────────────────────────────────────────
  const runAddressSearch = (text: string) => {
    setForm((f) => ({ ...f, address: text }));
    // editing the address invalidates the saved location — must re-pick from Google
    setLocationDirty(true);
    setSelectedPlaceId(null);
    setAddressCoords(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setSuggestions([]); setSearchingPlaces(false); return; }
    setSearchingPlaces(true);
    debounceRef.current = setTimeout(async () => {
      const results = await placesAutocomplete(text, sessionTokenRef.current);
      setSuggestions(results);
      setSearchingPlaces(false);
    }, 300);
  };

  const selectPlace = async (s: PlaceSuggestion) => {
    setSuggestions([]);
    setForm((f) => ({ ...f, address: s.secondary || s.primary || s.full }));
    const details = await placeDetails(s.placeId, sessionTokenRef.current);
    if (details && details.lat != null && details.lng != null) {
      setAddressCoords({ lat: details.lat, lng: details.lng });
      setSelectedPlaceId(details.placeId);
      setForm((f) => ({ ...f, address: s.secondary || s.primary || s.full }));
      setLocationDirty(false);
      sessionTokenRef.current = newPlacesSessionToken();
    } else {
      Alert.alert('Try again', "Couldn't load that location. Please select it again.");
    }
  };

  const clearAddress = () => {
    setForm((f) => ({ ...f, address: '' }));
    setAddressCoords(null);
    setSelectedPlaceId(null);
    setSuggestions([]);
    setLocationDirty(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter a venue name.'); return; }
    if (!form.address.trim()) { Alert.alert('Required', 'Please enter an address.'); return; }
    if (locationDirty && !selectedPlaceId) { Alert.alert('Select your venue', 'You changed the address — please tap your venue from the Google list.'); return; }
    if (saving) return;
    setSaving(true);
    const updates = {
      name: form.name.trim(),
      venueType: form.venueType,
      googleMapsLocation: {
        lat: addressCoords?.lat ?? venue.googleMapsLocation?.lat ?? 0,
        lng: addressCoords?.lng ?? venue.googleMapsLocation?.lng ?? 0,
        address: form.address.trim(),
        placeId: selectedPlaceId ?? venue.googleMapsLocation?.placeId ?? undefined,
      },
      capacity: form.capacity,
      vibeDescription: form.vibeDescription,
      preferredEnergy: form.preferredEnergy as unknown as EnergyType[],
      genrePreferences: form.genrePreferences,
      audienceType: form.audienceType,
      subVibe: form.subVibe,
      rulesTemplate: form.rulesTemplate,
      instagramUrl: form.instagramUrl,
      musicLink: form.musicLink,
      color: form.color,
      billing: (form.billingCompanyName.trim() || form.billingTrnNumber.trim()) ? {
        companyName: form.billingCompanyName.trim(),
        companyAddress: form.billingCompanyAddress.trim(),
        trnNumber: form.billingTrnNumber.trim(),
      } : undefined,
    };
    updateVenue(venue.id, updates);
    await supabase.from('venues').update({
      name: form.name.trim(),
      venue_type: form.venueType,
      address: form.address.trim(),
      lat: addressCoords?.lat ?? venue.googleMapsLocation?.lat ?? null,
      lng: addressCoords?.lng ?? venue.googleMapsLocation?.lng ?? null,
      place_id: selectedPlaceId ?? venue.googleMapsLocation?.placeId ?? null,
      capacity: form.capacity || null,
      vibe_description: form.vibeDescription || null,
      preferred_energy: form.preferredEnergy,
      genre_preferences: form.genrePreferences,
      audience_type: form.audienceType,
      sub_vibe: form.subVibe,
      rules_template: form.rulesTemplate || null,
      instagram_url: form.instagramUrl || null,
      music_link: form.musicLink || null,
      color: form.color,
      billing_company_name: form.billingCompanyName || null,
      billing_company_address: form.billingCompanyAddress || null,
      billing_trn_number: form.billingTrnNumber || null,
      updated_at: new Date().toISOString(),
    }).eq('id', venue.id);
    originalForm.current = { ...form };
    setSavedTick((t) => t + 1);
    setSaving(false);
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Fixed Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Venue</Text>
        <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [styles.headerSaveBtn, { opacity: pressed || saving ? 0.85 : 1 }]}>
          <Text style={styles.headerSaveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 + keyboardHeight }}>

        {/* The venue image is derived from its TYPE (lib/venue-images.ts) — there is
            no photo upload. Pick a type below and the picture follows. */}
        <Image source={venueImage(form.venueType)} style={styles.photoBanner} resizeMode="cover" />

        <View style={styles.form}>
          {/* Venue Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Venue Name *</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Enter venue name"
              placeholderTextColor={colors.muted}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              returnKeyType="done"
            />
          </View>

          {/* Venue Type */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Venue Type</Text>
            <View style={styles.chipRow}>
              {VENUE_TYPES.map((vt) => (
                <Pressable
                  key={vt}
                  style={[styles.chip, { borderColor: form.venueType === vt ? colors.primary : colors.border, backgroundColor: form.venueType === vt ? colors.primary : colors.surface }]}
                  onPress={() => setForm((f) => ({ ...f, venueType: vt }))}
                >
                  <Text style={[styles.chipText, { color: form.venueType === vt ? '#fff' : colors.foreground }]}>{vt}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Address */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Address *</Text>
            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: selectedPlaceId ? colors.primary : colors.border }]}>
              <MaterialIcons name={selectedPlaceId ? 'place' : 'search'} size={18} color={selectedPlaceId ? colors.primary : colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search your venue on Google..."
                placeholderTextColor={colors.muted}
                value={form.address}
                onChangeText={runAddressSearch}
                autoCorrect={false}
              />
              {form.address ? (
                <Pressable onPress={clearAddress} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {searchingPlaces && (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Searching…</Text>
            )}
            {suggestions.length > 0 && (
              <View style={[styles.suggestList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.placeId}
                    style={({ pressed }) => [styles.suggestRow, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                    onPress={() => selectPlace(s)}
                  >
                    <MaterialIcons name="place" size={16} color={colors.muted} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestPrimary, { color: colors.foreground }]} numberOfLines={1}>{s.primary}</Text>
                      {!!s.secondary && <Text style={[styles.suggestSecondary, { color: colors.muted }]} numberOfLines={1}>{s.secondary}</Text>}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {locationDirty && !selectedPlaceId && form.address.trim().length > 0 && (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Tap your venue from the list to set its location.</Text>
            )}
          </View>

          {/* Preferred Energy */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Preferred Energy</Text>
            <View style={styles.chipRow}>
              {VENUE_ENERGY_OPTIONS.map((e) => {
                const selected = form.preferredEnergy.includes(e);
                return (
                  <Pressable
                    key={e}
                    style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                    onPress={() => toggleEnergy(e)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : colors.foreground }]}>{e}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Venue Color */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Venue Color</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>This color identifies your venue on the calendar</Text>
            <View style={styles.chipRow}>
              {VENUE_COLORS.map((c) => (
                <Pressable
                  key={c.hex}
                  style={[styles.colorSwatch, { backgroundColor: c.hex, borderColor: form.color === c.hex ? '#fff' : 'transparent', borderWidth: form.color === c.hex ? 2.5 : 0 }]}
                  onPress={() => setForm((f) => ({ ...f, color: c.hex }))}
                >
                  {form.color === c.hex && <MaterialIcons name="check" size={16} color="#fff" />}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Capacity */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Capacity</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. 200"
              placeholderTextColor={colors.muted}
              value={form.capacity}
              onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>

          {/* Vibe Description */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Vibe Description</Text>
            <TextInput
              style={[styles.fieldInputMulti, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Describe the venue vibe..."
              placeholderTextColor={colors.muted}
              value={form.vibeDescription}
              onChangeText={(v) => setForm((f) => ({ ...f, vibeDescription: v }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Audience Type */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Audience Type</Text>
            <View style={styles.chipRow}>
              {AUDIENCE_TYPES.map((a) => {
                const selected = form.audienceType.includes(a);
                return (
                  <Pressable
                    key={a}
                    style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                    onPress={() => toggleAudience(a)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : colors.foreground }]}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Genre Preferences */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Genre Preferences</Text>
            <View style={styles.chipRow}>
              {GENRE_PREFS.map((g) => {
                const selected = form.genrePreferences.includes(g);
                return (
                  <Pressable
                    key={g}
                    style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                    onPress={() => toggleGenre(g)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : colors.foreground }]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Sub-Vibe */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Sub-Vibe</Text>
            <View style={styles.chipRow}>
              {SUB_VIBES.map((v) => {
                const selected = form.subVibe.includes(v);
                return (
                  <Pressable
                    key={v}
                    style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                    onPress={() => toggleSubVibe(v)}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : colors.foreground }]}>{v}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Rules Template */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Rules Template</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: -4, marginBottom: 8, lineHeight: 16 }}>
              Rules are sent to artists when they join your roster or accept a booking at this venue.
            </Text>
            <TextInput
              style={[styles.fieldInputMulti, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="House rules for artists..."
              placeholderTextColor={colors.muted}
              value={form.rulesTemplate}
              onChangeText={(v) => setForm((f) => ({ ...f, rulesTemplate: v }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Instagram */}
<Text style={[styles.fieldLabel, { color: colors.foreground }]}>Instagram</Text>
<View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, borderColor: colors.border, backgroundColor: colors.surface }}>
  <Text style={{ paddingLeft: 12, color: colors.muted, fontSize: 15 }}>instagram.com/</Text>
  <TextInput
    style={{ flex: 1, padding: 12, fontSize: 15, color: colors.foreground }}
    placeholder="username"
    placeholderTextColor={colors.muted}
    value={form.instagramUrl?.replace('https://www.instagram.com/', '').replace('https://instagram.com/', '') ?? ''}
    onChangeText={(v) => setForm((f) => ({ ...f, instagramUrl: v.replace('@', '').replace(/\s/g, '').toLowerCase() }))}
    autoCapitalize="none"
    autoCorrect={false}
    returnKeyType="done"
  />
</View>


          {/* Music Link */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Music Link</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="SoundCloud, Spotify, YouTube..."
              placeholderTextColor={colors.muted}
              value={form.musicLink}
              onChangeText={(v) => setForm((f) => ({ ...f, musicLink: v }))}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />
          </View>

          {/* Billing Details */}
          <View style={[styles.fieldGroup, { marginTop: 8 }]}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontSize: 16, fontWeight: '800', marginBottom: 4 }]}>Billing Details</Text>
            <Text style={[{ color: colors.muted, fontSize: 12, marginBottom: 8 }]}>These details will appear on invoices sent by artists.</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Company / Legal Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Beach Club LLC"
              placeholderTextColor={colors.muted}
              value={form.billingCompanyName}
              onChangeText={(v) => setForm((f) => ({ ...f, billingCompanyName: v }))}
              returnKeyType="done"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Company Address</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Dubai Marina, Dubai"
              placeholderTextColor={colors.muted}
              value={form.billingCompanyAddress}
              onChangeText={(v) => setForm((f) => ({ ...f, billingCompanyAddress: v }))}
              returnKeyType="done"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>TRN Number</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. 100XXXXXXXXX003"
              placeholderTextColor={colors.muted}
              value={form.billingTrnNumber}
              onChangeText={(v) => setForm((f) => ({ ...f, billingTrnNumber: v }))}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  photoBanner: { position: 'relative', height: 180, width: '100%' },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  photoEditBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoEditText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  form: { padding: 20, gap: 20 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  fieldInputMulti: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suggestList: { borderWidth: 1, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestPrimary: { fontSize: 14, fontWeight: '500' },
  suggestSecondary: { fontSize: 12, marginTop: 1 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E2674A', borderRadius: 20 },
  headerSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
