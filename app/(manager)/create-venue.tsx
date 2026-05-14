import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform, useWindowDimensions } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { VenueType, VenueEnergy, VenueGenre, Venue, AudienceType, SubVibe } from '@/lib/types';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';

const VENUE_TYPES: VenueType[] = [
  'Dance Club', 'Beach Club', 'Lounge', 'Cocktail Bar', 'Bar / Restaurant',
  'Bar / Club', 'Rooftop', 'Live Music Venue', 'Event Space', 'Wedding Venue', 'Hotel / Resort',
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
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const TOTAL_STEPS = 4;

const ANIM_DURATION = 350;
const ANIM_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export default function CreateVenueScreen() {
  const router = useRouter();
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const addVenue = useVenueStore((s) => s.addVenue);
  const placesRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [displayStep, setDisplayStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
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
      if (!form.address.trim()) {
        Alert.alert('Required', 'Please enter and select a venue address.'); return;
      }
    }

    if (step < TOTAL_STEPS) {
      animateToStep(step + 1, 'forward');
      return;
    }

    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setIsLoading(false);

    const newVenue: Venue = {
      id: 'venue-' + Date.now(),
      managerId: currentUser?.id ?? '',
      name: form.name,
      venueType: form.venueType as VenueType,
      googleMapsLocation: { lat: addressCoords?.lat ?? 0, lng: addressCoords?.lng ?? 0, address: form.address || '' },
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
      photoUrls: [],
      color: form.color,
      isHidden: false,
      isComplete: true,
      hasCompletedBooking: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addVenue(newVenue);
    router.replace('/(manager)/my-venues' as Href);
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
          {displayStep === 2 && 'Vibe & Music'}
          {displayStep === 3 && 'Rules & Links'}
          {displayStep === 4 && 'Billing Details'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Step {displayStep} of {TOTAL_STEPS}</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        <Animated.View style={animatedStyle}>
        {/* spacer removed — header is now outside scroll */}

          {displayStep === 1 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Venue Name *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Cé La Vi Dubai" placeholderTextColor={colors.muted} value={form.name} onChangeText={(v) => update('name', v)} returnKeyType="done" />
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
                <Text style={[styles.label, { color: colors.foreground }]}>Address *</Text>
                {GOOGLE_MAPS_API_KEY ? (
                  <View style={[styles.placesContainer, { borderColor: form.address ? colors.primary : colors.border }]}>
                    <GooglePlacesAutocomplete
                      ref={placesRef}
                      placeholder="Search address..."
                      fetchDetails
                      onPress={(data, details) => {
                        update('address', data.description);
                        if (details?.geometry?.location) {
                          setAddressCoords({
                            lat: details.geometry.location.lat,
                            lng: details.geometry.location.lng,
                          });
                        }
                      }}
                      query={{ key: GOOGLE_MAPS_API_KEY, language: 'en', components: 'country:ae' }}
                      styles={{
                        textInput: {
                          backgroundColor: colors.surface,
                          color: colors.foreground,
                          fontSize: 15,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          height: 46,
                          borderWidth: 0,
                        },
                        listView: {
                          backgroundColor: colors.surface,
                          borderRadius: 10,
                          marginTop: 4,
                        },
                        row: { backgroundColor: colors.surface, paddingVertical: 10, paddingHorizontal: 12 },
                        description: { color: colors.foreground, fontSize: 14 },
                        separator: { backgroundColor: colors.border, height: 0.5 },
                      }}
                      textInputProps={{ placeholderTextColor: colors.muted }}
                      enablePoweredByContainer={false}
                      keyboardShouldPersistTaps="handled"
                    />
                    {form.address ? (
                      <Pressable
                        style={styles.clearAddressBtn}
                        onPress={() => {
                          update('address', '');
                          setAddressCoords(null);
                          placesRef.current?.clear();
                        }}
                      >
                        <MaterialIcons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. Level 54, Address Sky View, Dubai"
                    placeholderTextColor={colors.muted}
                    value={form.address}
                    onChangeText={(v) => update('address', v)}
                    returnKeyType="done"
                  />
                )}
                {!GOOGLE_MAPS_API_KEY && (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable address autocomplete</Text>
                )}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Venue Color (optional)</Text>
                <Text style={[{ color: colors.muted, fontSize: 12, marginBottom: 4 }]}>This color will identify your venue on the calendar</Text>
                <View style={styles.chipGrid}>
                  {VENUE_COLORS.map((c) => (
                    <Pressable
                      key={c.hex}
                      style={[styles.colorSwatch, { backgroundColor: c.hex, borderColor: form.color === c.hex ? '#fff' : 'transparent', borderWidth: form.color === c.hex ? 2.5 : 0 }]}
                      onPress={() => update('color', c.hex)}
                    >
                      {form.color === c.hex && <MaterialIcons name="check" size={16} color="#fff" />}
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Capacity (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 500" placeholderTextColor={colors.muted} value={form.capacity} onChangeText={(v) => update('capacity', v)} keyboardType="number-pad" returnKeyType="done" />
              </View>
            </View>
          )}

          {displayStep === 2 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Vibe Description (optional)</Text>
                <TextInput style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="Describe the atmosphere and what makes your venue unique..." placeholderTextColor={colors.muted} value={form.vibeDescription} onChangeText={(v) => update('vibeDescription', v)} multiline numberOfLines={3} maxLength={300} />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Audience Type (optional)</Text>
                <View style={styles.chipGrid}>
                  {AUDIENCE_TYPES.map((a) => (
                    <Pressable key={a} style={[styles.chip, { borderColor: form.audienceType.includes(a) ? colors.primary : colors.border, backgroundColor: form.audienceType.includes(a) ? colors.primary : colors.surface }]} onPress={() => toggleItem('audienceType', a, form.audienceType)}>
                      <Text style={[styles.chipText, { color: form.audienceType.includes(a) ? '#fff' : colors.foreground }]}>{a}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Preferred Energy (optional)</Text>
                <View style={styles.chipGrid}>
                  {VENUE_ENERGY_OPTIONS.map((e) => (
                    <Pressable key={e} style={[styles.chip, { borderColor: form.preferredEnergy.includes(e) ? colors.primary : colors.border, backgroundColor: form.preferredEnergy.includes(e) ? colors.primary : colors.surface }]} onPress={() => toggleItem('preferredEnergy', e, form.preferredEnergy)}>
                      <Text style={[styles.chipText, { color: form.preferredEnergy.includes(e) ? '#fff' : colors.foreground }]}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Genre Preferences (optional)</Text>
                <View style={styles.chipGrid}>
                  {GENRE_PREFS.map((g) => (
                    <Pressable key={g} style={[styles.chip, { borderColor: form.genrePreferences.includes(g) ? colors.primary : colors.border, backgroundColor: form.genrePreferences.includes(g) ? colors.primary : colors.surface }]} onPress={() => toggleItem('genrePreferences', g, form.genrePreferences)}>
                      <Text style={[styles.chipText, { color: form.genrePreferences.includes(g) ? '#fff' : colors.foreground }]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Sub-Vibe (optional)</Text>
                <View style={styles.chipGrid}>
                  {SUB_VIBES.map((v) => (
                    <Pressable key={v} style={[styles.chip, { borderColor: form.subVibe.includes(v) ? colors.primary : colors.border, backgroundColor: form.subVibe.includes(v) ? colors.primary : colors.surface }]} onPress={() => toggleItem('subVibe', v, form.subVibe)}>
                      <Text style={[styles.chipText, { color: form.subVibe.includes(v) ? '#fff' : colors.foreground }]}>{v}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {displayStep === 3 && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Venue Rules (optional)</Text>
                <TextInput style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. No explicit lyrics, set ends at 3am..." placeholderTextColor={colors.muted} value={form.rulesTemplate} onChangeText={(v) => update('rulesTemplate', v)} multiline numberOfLines={4} maxLength={500} />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Instagram URL (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="https://instagram.com/yourvenue" placeholderTextColor={colors.muted} value={form.instagramUrl} onChangeText={(v) => update('instagramUrl', v)} autoCapitalize="none" keyboardType="url" returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Spotify / SoundCloud / Mixcloud (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="https://open.spotify.com/..." placeholderTextColor={colors.muted} value={form.musicLink} onChangeText={(v) => update('musicLink', v)} autoCapitalize="none" keyboardType="url" returnKeyType="done" />
              </View>
            </View>
          )}

          {displayStep === 4 && (
            <View style={styles.form}>
              <Text style={[{ color: colors.muted, fontSize: 13, marginBottom: 8 }]}>These details will appear on invoices sent by artists for this venue.</Text>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Company / Legal Name (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Beach Club LLC" placeholderTextColor={colors.muted} value={form.billingCompanyName} onChangeText={(v) => update('billingCompanyName', v)} returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Company Address (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Dubai Marina, Dubai" placeholderTextColor={colors.muted} value={form.billingCompanyAddress} onChangeText={(v) => update('billingCompanyAddress', v)} returnKeyType="done" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>TRN Number (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 100XXXXXXXXX003" placeholderTextColor={colors.muted} value={form.billingTrnNumber} onChangeText={(v) => update('billingTrnNumber', v)} keyboardType="number-pad" returnKeyType="done" />
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
      {/* Fixed Continue button — always visible above keyboard */}
      <View style={[styles.fixedBtnContainer, { backgroundColor: colors.background }]}>
        <Pressable style={({ pressed }) => [styles.nextBtn, { opacity: pressed || isLoading ? 0.8 : 1 }]} onPress={handleNext} disabled={isLoading || isAnimating}>
          <Text style={styles.nextBtnText}>{isLoading ? 'Creating...' : step < TOTAL_STEPS ? 'Continue' : 'Create Venue'}</Text>
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
  fieldGroup: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '500' },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fixedBtnContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth },
  nextBtn: { backgroundColor: '#2563EB', borderRadius: 14, padding: 16, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  placesContainer: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  clearAddressBtn: { position: 'absolute', right: 10, top: 14, zIndex: 10 },
});
