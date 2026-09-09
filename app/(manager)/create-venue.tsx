import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform, useWindowDimensions } from '@/lib/rn';
import { placesAutocomplete, placeDetails, newPlacesSessionToken, type PlaceSuggestion } from '@/lib/places';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useLineupStore, useNotificationStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import type { VenueType, VenueEnergy, VenueGenre, Venue, AudienceType, SubVibe, VenueSchedule, VenueMonthlyBudget } from '@/lib/types';
import { ScheduleEditor } from '@/components/schedule-editor';
import { BudgetEditor } from '@/components/budget-editor';
import { CycleDayPicker } from '@/components/cycle-day-picker';
import { normalizeBudgets } from '@/lib/venue-budget';
import { ensureScheduleSlots } from '@/lib/venue-schedule-sync';
import { todayLocalStr, addDaysStr } from '@/lib/utils';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { pickImage, uploadImageAsync } from '@/lib/upload';
import { Image } from '@/lib/rn';

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
const ENERGY_TYPES: VenueEnergy[] = ['Lounge', 'Warm-up', 'Sunset', 'Peak Time', 'Closing', 'All Night Long'];
const VENUE_ENERGY_OPTIONS = ['Low', 'High', 'Mixed'] as const;
type VenueEnergyOption = typeof VENUE_ENERGY_OPTIONS[number];
const GENRE_PREFS: VenueGenre[] = [
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
const TOTAL_STEPS = 4;

const ANIM_DURATION = 350;
const ANIM_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export default function CreateVenueScreen() {
  const router = useRouter();
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const currentUser = useAuthStore((s) => s.currentUser);
  const addVenue = useVenueStore((s) => s.addVenue);
  const globalLineup = useLineupStore((s) => s.globalLineup);
  const assignToVenue = useLineupStore((s) => s.assignToVenue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newPlacesSessionToken());
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  // Optional venue photo the manager adds during creation (local URI until submit uploads it).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    venueType: '' as VenueType | '',
    address: '',
    capacity: '',
    vibeDescription: '',
    preferredEnergy: [] as VenueEnergyOption[],
    genrePreferences: [] as VenueGenre[],
    audienceType: [] as AudienceType[],
    subVibe: [] as SubVibe[],
    rulesTemplate: '',
    instagramUrl: '',
    musicLink: '',
    color: colors.primary,
    billingCompanyName: '',
    billingCompanyAddress: '',
    billingTrnNumber: '',
    billingCycleEndDay: 31,
    schedule: [] as VenueSchedule,
    monthlyBudgets: [] as VenueMonthlyBudget[],
  });
  const [isLoading, setIsLoading] = useState(false);

  // Animation shared value: 0 = centered, negative = slide left (forward), positive = slide right (back)
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animateToStep = useCallback((newStep: number, direction: 'forward' | 'back') => {
    setIsAnimating(true);

    // Slide out: current content exits to the opposite side
    translateX.value = withTiming(direction === 'forward' ? -screenWidth : screenWidth, {
      duration: ANIM_DURATION,
      easing: ANIM_EASING,
    }, () => {
      // Update step on JS thread
      runOnJS(setDisplayStep)(newStep);
      runOnJS(setStep)(newStep);

      // Position new content off-screen on the entry side
      translateX.value = direction === 'forward' ? screenWidth : -screenWidth;

      // Slide in: new content enters from the entry side
      translateX.value = withTiming(0, { duration: ANIM_DURATION, easing: ANIM_EASING }, () => {
        runOnJS(setIsAnimating)(false);
      });
    });

    // Scroll to top
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [screenWidth, translateX]);

  const update = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const runAddressSearch = (text: string) => {
    update('address', text);
    // typing invalidates any prior selection — manager must pick from the list again
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
    update('address', s.secondary || s.primary || s.full);
    const details = await placeDetails(s.placeId, sessionTokenRef.current);
    if (details && details.lat != null && details.lng != null) {
      setAddressCoords({ lat: details.lat, lng: details.lng });
      setSelectedPlaceId(details.placeId);
      update('address', s.secondary || s.primary || s.full);
      // next search starts a fresh billing session
      sessionTokenRef.current = newPlacesSessionToken();
    } else {
      Alert.alert('Try again', "Couldn't load that location. Please select it again.");
    }
  };

  const clearAddress = () => {
    update('address', '');
    setAddressCoords(null);
    setSelectedPlaceId(null);
    setSuggestions([]);
  };

  const toggleItem = <T extends string>(key: string, item: T, current: T[]) => {
    setForm((f) => ({
      ...f,
      [key]: current.includes(item) ? current.filter((x) => x !== item) : [...current, item],
    }));
  };

  const handleNext = async () => {
  if (isAnimating) return;

  if (step === 1) {
    if (!form.name.trim() || !form.venueType) {
      Alert.alert('Required', 'Please enter venue name and type.'); return;
    }
    if (!form.address.trim() || !selectedPlaceId || !addressCoords) {
      Alert.alert('Select your venue', 'Please search and tap your venue from the Google list.'); return;
    }
  }

  if (step < TOTAL_STEPS) {
    animateToStep(step + 1, 'forward');
    return;
  }

  setIsLoading(true);

  // ✅ Get real Supabase auth user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    setIsLoading(false);
    Alert.alert('Error', 'Not authenticated. Please sign in again.');
    return;
  }

  // ✅ Insert venue into Supabase
  const { data: venueData, error: insertError } = await supabase.from('venues').insert({
    manager_id: user.id,
    name: form.name,
    venue_type: form.venueType,
    address: form.address,
    lat: addressCoords?.lat ?? null,
    lng: addressCoords?.lng ?? null,
    place_id: selectedPlaceId,
    capacity: form.capacity || null,
    vibe_description: form.vibeDescription || null,
    preferred_energy: form.preferredEnergy,
    genre_preferences: form.genrePreferences,
    audience_type: form.audienceType,
    sub_vibe: form.subVibe,
    rules_template: form.rulesTemplate || null,
    instagram_url: form.instagramUrl ? `https://www.instagram.com/${form.instagramUrl}` : null,
music_link: form.musicLink ? (form.musicLink.startsWith('http') ? form.musicLink : `https://${form.musicLink}`) : null,
    color: form.color,
    billing_company_name: form.billingCompanyName || null,
    billing_company_address: form.billingCompanyAddress || null,
    billing_trn_number: form.billingTrnNumber || null,
    billing_cycle_end_day: form.billingCycleEndDay,
    monthly_budgets: normalizeBudgets(form.monthlyBudgets),
    schedule: form.schedule,
    is_hidden: false,
  }).select().single();

  setIsLoading(false);

  if (insertError) {
  if (insertError.code === '23505') {
    Alert.alert('Name taken', 'A venue with this name already exists. Please choose a different name.');
  } else {
    Alert.alert('Error creating venue', insertError.message);
  }
  return;
}

  // Upload the venue photo (if the manager added one) now that we have the venue id, and stamp it
  // on the row. Optional — with no photo the app falls back to the venue-type artwork everywhere.
  let adminPhotoUrl: string | null = null;
  if (photoUri) {
    try {
      adminPhotoUrl = await uploadImageAsync(photoUri, 'venue-photos', `venue-${venueData.id}`);
      await supabase.from('venues').update({ admin_photo_url: adminPhotoUrl }).eq('id', venueData.id);
    } catch { adminPhotoUrl = null; }
  }

  // ✅ Also add to local store so it shows immediately without refetch
  const newVenue: Venue = {
    id: venueData.id,
    managerId: user.id,
    name: form.name,
    venueType: form.venueType as VenueType,
    adminPhotoUrl: adminPhotoUrl ?? undefined,
    googleMapsLocation: { lat: addressCoords?.lat ?? 0, lng: addressCoords?.lng ?? 0, address: form.address || '', placeId: selectedPlaceId ?? undefined },
    capacity: form.capacity || undefined,
    vibeDescription: form.vibeDescription || undefined,
    preferredEnergy: form.preferredEnergy as unknown as VenueEnergy[],
    genrePreferences: form.genrePreferences,
    audienceType: form.audienceType.length > 0 ? form.audienceType : undefined,
    subVibe: form.subVibe.length > 0 ? form.subVibe : undefined,
    rulesTemplate: form.rulesTemplate || undefined,
    instagramUrl: form.instagramUrl || undefined,
    musicLink: form.musicLink || undefined,
    billing: (form.billingCompanyName.trim() || form.billingTrnNumber.trim()) ? {
      companyName: form.billingCompanyName.trim(),
      companyAddress: form.billingCompanyAddress.trim(),
      trnNumber: form.billingTrnNumber.trim(),
    } : undefined,
    billingCycleEndDay: form.billingCycleEndDay,
    monthlyBudgets: normalizeBudgets(form.monthlyBudgets),
    color: form.color,
    schedule: form.schedule,
    isHidden: false,
    isComplete: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addVenue(newVenue);

  // Fill the calendar from the new venue's programme for a horizon (materialize-on-view
  // handles months beyond this when they're opened).
  if (newVenue.schedule && newVenue.schedule.length > 0) {
    const t = todayLocalStr();
    ensureScheduleSlots(t, addDaysStr(t, 60));
  }

  // Assign all existing lineup artists to the new venue
  const activeLineup = globalLineup.filter(
    (r) => r.managerId === user.id && r.status === 'active'
  );
  if (activeLineup.length > 0) {
    // Supabase bulk upsert
    const assignments = activeLineup.map((r) => ({
      manager_id: user.id,
      artist_id: r.artistId,
      venue_id: venueData.id,
      status: 'active',
    }));
    await supabase.from('venue_assignments').upsert(assignments, { onConflict: 'venue_id,artist_id' });
    // Local store
    activeLineup.forEach((r) => {
      assignToVenue({
        id: `va-${venueData.id}-${r.artistId}`,
        globalLineupId: r.id,
        venueId: venueData.id,
        artistId: r.artistId,
        assignedAt: new Date().toISOString(),
        status: 'active' as const,
      });
      // Tell each roster artist about the new venue — they're auto-assigned above, so the
      // existing 'venue_assigned' copy ("You can now be booked at …") is accurate.
      useNotificationStore.getState().addNotification({
        id: `notif-${Date.now()}-${r.artistId}`,
        userId: r.artistId,
        type: 'venue_assigned',
        title: 'New Venue',
        body: `You can now be booked at ${form.name}`,
        isRead: false,
        relatedId: venueData.id,
        relatedType: 'venue',
        createdAt: new Date().toISOString(),
      });
    });
  }

  router.replace('/(manager)/(tabs)/calendar' as Href);
};

  const handleBack = () => {
    if (isAnimating) return;
    if (step > 1) {
      animateToStep(step - 1, 'back');
    } else {
      router.back();
    }
  };

  return (
    <ScreenContainer>
      {/* Fixed Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.stepIndicator}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.stepDot, { backgroundColor: i + 1 <= step ? colors.primary : colors.border }]} />
          ))}
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {displayStep === 1 && 'Venue Basics'}
          {displayStep === 2 && 'Billing Details'}
          {displayStep === 3 && 'Schedule'}
          {displayStep === 4 && 'Budget'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Step {displayStep} of {TOTAL_STEPS}</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, { paddingBottom: 24 + keyboardHeight }]} keyboardShouldPersistTaps="handled">
        <Animated.View style={animatedStyle}>
        {/* spacer removed — header is now outside scroll */}

          {displayStep === 1 && (
            <View style={styles.form}>
              {/* Optional venue photo — tap to add now, or skip and the app uses the venue-type artwork. */}
              <Pressable
                onPress={async () => { const uri = await pickImage({ aspect: [16, 9] }); if (uri) setPhotoUri(uri); }}
                style={({ pressed }) => [styles.photoBanner, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
              >
                {photoUri ? (
                  <>
                    <Image source={{ uri: photoUri }} style={styles.photoBannerImg} resizeMode="cover" />
                    <View style={styles.photoBannerEdit}>
                      <MaterialIcons name="photo-camera" size={16} color="#fff" />
                      <Text style={styles.photoBannerEditText}>Change photo</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.photoBannerEmpty}>
                    <MaterialIcons name="add-a-photo" size={26} color={colors.muted} />
                    <Text style={[styles.photoBannerHint, { color: colors.muted }]}>Add a venue photo (optional)</Text>
                  </View>
                )}
              </Pressable>
              {photoUri && (
                <Pressable onPress={() => setPhotoUri(null)} hitSlop={8} style={({ pressed }) => [{ alignSelf: 'center', opacity: pressed ? 0.6 : 1, marginBottom: 10 }]}>
                  <Text style={[styles.label, { color: colors.muted }]}>Remove photo</Text>
                </Pressable>
              )}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Venue Name *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Space Dubai" placeholderTextColor={colors.muted} value={form.name} onChangeText={(v) => update('name', v)} returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Address *</Text>
                <View>
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
                  {selectedPlaceId ? (
                    <Text style={{ color: colors.primary, fontSize: 12, marginTop: 6 }}>✓ Location selected</Text>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Search and tap your venue to set its location.</Text>
                  )}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Venue Type *</Text>
                <View style={styles.chipGrid}>
                  {VENUE_TYPES.map((t) => (
                    <Pressable key={t} style={[styles.chip, { borderColor: form.venueType === t ? colors.primary : colors.border, backgroundColor: form.venueType === t ? colors.primary : colors.surface }]} onPress={() => update('venueType', t)}>
                      <Text style={[styles.chipText, { color: form.venueType === t ? '#fff' : colors.foreground }]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Capacity (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 500" placeholderTextColor={colors.muted} value={form.capacity} onChangeText={(v) => update('capacity', v)} keyboardType="number-pad" returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Instagram (optional)</Text>
                <View style={[styles.instagramRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.instagramAt, { color: colors.muted, borderRightColor: colors.border }]}>@</Text>
                  <TextInput
                    style={[styles.instagramInput, { color: colors.foreground }]}
                    placeholder="username"
                    placeholderTextColor={colors.muted}
                    value={form.instagramUrl.replace(/^@/, '')}
                    onChangeText={(v) => update('instagramUrl', v.replace('@', '').replace(/\s/g, '').toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          )}

          {displayStep === 2 && (
            <View style={styles.form}>
              <Text style={[{ color: colors.muted, fontSize: 13, marginBottom: 8 }]}>These details will appear on invoices sent by artists for this venue.</Text>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Company / Legal Name</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Beach Club LLC" placeholderTextColor={colors.muted} value={form.billingCompanyName} onChangeText={(v) => update('billingCompanyName', v)} returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Company Address</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Dubai Marina, Dubai" placeholderTextColor={colors.muted} value={form.billingCompanyAddress} onChangeText={(v) => update('billingCompanyAddress', v)} returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>TRN Number</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 100XXXXXXXXX003" placeholderTextColor={colors.muted} value={form.billingTrnNumber} onChangeText={(v) => update('billingTrnNumber', v)} keyboardType="number-pad" returnKeyType="done" />
              </View>
              <View style={[styles.fieldGroup, { zIndex: 10 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Billing cycle ends on</Text>
                <CycleDayPicker value={form.billingCycleEndDay} onChange={(day) => update('billingCycleEndDay', day)} />
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Your billing month for this venue ends on this day. 31 = the last day of each month (the normal calendar month).</Text>
              </View>
            </View>
          )}

          {displayStep === 3 && (
            <View style={styles.form}>
              <ScheduleEditor value={form.schedule} onChange={(next) => update('schedule', next)} />
            </View>
          )}

          {displayStep === 4 && (
            <View style={styles.form}>
              <BudgetEditor value={form.monthlyBudgets} onChange={(next) => update('monthlyBudgets', next)} />
            </View>
          )}
        </Animated.View>
      </ScrollView>
      {/* Fixed Continue button — always visible above keyboard */}
      <View style={[styles.fixedBtnContainer, { backgroundColor: colors.background, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 10 : 16 }]}>
        <Pressable style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]} onPress={handleNext} disabled={isLoading || isAnimating}>
          <Text style={styles.nextBtnText}>{isLoading ? 'Creating...' : step === TOTAL_STEPS ? 'Create Venue' : 'Continue'}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20 },
  header: { paddingHorizontal: 20, paddingVertical: 16, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { marginBottom: 12 },
  stepIndicator: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14 },
  form: { gap: 20, marginBottom: 32 },
  photoBanner: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoBannerImg: { ...StyleSheet.absoluteFillObject },
  photoBannerEdit: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  photoBannerEditText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  photoBannerEmpty: { alignItems: 'center', gap: 6 },
  photoBannerHint: { fontSize: 13, fontWeight: '500' },
  fieldGroup: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '500' },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fixedBtnContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth },
  nextBtn: { backgroundColor: '#E2674A', borderRadius: 14, padding: 16, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  placesContainer: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  clearAddressBtn: { position: 'absolute', right: 10, top: 14, zIndex: 10 },
  prefixInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  prefix: { paddingLeft: 12, fontSize: 15 },
  prefixTextInput: { flex: 1, padding: 12, fontSize: 15 },
  instagramRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  instagramAt: { paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontWeight: '700', borderRightWidth: 1 },
  instagramInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suggestList: { borderWidth: 1, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestPrimary: { fontSize: 14, fontWeight: '500' },
  suggestSecondary: { fontSize: 12, marginTop: 1 },
});
