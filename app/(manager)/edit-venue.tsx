import { useMemo, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import type { VenueType, EnergyType, GenreType, AudienceType, SubVibe } from '@/lib/types';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

// ── Option arrays — kept in sync with create-venue.tsx ───────────────────────
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
const ENERGY_TYPES: EnergyType[] = ['Lounge', 'Warm-up', 'Sunset', 'Peak Time', 'Closing', 'All Night Long'];
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
  const deleteVenue = useVenueStore((s) => s.deleteVenue);

  const [form, setForm] = useState({
    name: venue?.name ?? '',
    venueType: (venue?.venueType ?? 'Dance Club') as VenueType,
    address: venue?.googleMapsLocation?.address ?? '',
    capacity: venue?.capacity ?? '',
    vibeDescription: venue?.vibeDescription ?? '',
    preferredEnergy: (venue?.preferredEnergy ?? []) as EnergyType[],
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

  const [photoUri, setPhotoUri] = useState<string | null>(
    venue?.photoUrls?.[0] ?? null
  );

  // Track original values for change detection
  const originalForm = useRef({ ...form });
  const originalPhoto = useRef<string | null>(venue?.photoUrls?.[0] ?? null);

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
      photoUri !== originalPhoto.current ||
      form.billingCompanyName !== o.billingCompanyName ||
      form.billingCompanyAddress !== o.billingCompanyAddress ||
      form.billingTrnNumber !== o.billingTrnNumber
    );
  }, [form, photoUri]);

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
  const toggleEnergy = (e: EnergyType) =>
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

  // ── Photo picker ──────────────────────────────────────────────────────────
  const handlePickPhoto = () => {
    Alert.alert('Change Venue Photo', 'Choose an option', [
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
        },
      },
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Needed', 'Camera permission is required to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
        },
      },
      ...(photoUri
        ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setPhotoUri(null) }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter a venue name.'); return; }
    if (!form.address.trim()) { Alert.alert('Required', 'Please enter an address.'); return; }
    Alert.alert(
      'Save Changes',
      'Are you sure you want to save these changes?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () => {
            updateVenue(venue.id, {
              name: form.name.trim(),
              venueType: form.venueType,
              googleMapsLocation: { ...venue.googleMapsLocation, address: form.address.trim() },
              capacity: form.capacity,
              vibeDescription: form.vibeDescription,
              preferredEnergy: form.preferredEnergy,
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
              photoUrls: photoUri ? [photoUri] : [],
            });
            originalForm.current = { ...form };
            originalPhoto.current = photoUri;
            Alert.alert('Saved', 'Venue info has been updated.');
            router.back();
          },
        },
      ]
    );
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Venue',
      `Are you sure you want to permanently delete "${venue.name}"? This will also remove all associated slots. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteVenue(venue.id);
            router.replace('/(manager)/(tabs)/profile' as any);
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* Fixed Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit Venue</Text>
        <Pressable onPress={handleSave} style={({ pressed }) => [styles.headerSaveBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={styles.headerSaveBtnText}>Save</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 + keyboardHeight }}>

        {/* Venue Photo Banner */}
        <Pressable onPress={handlePickPhoto} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
          {photoUri ? (
            <View style={styles.photoBanner}>
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
              <View style={styles.photoOverlay}>
                <View style={styles.photoEditBadge}>
                  <MaterialIcons name="camera-alt" size={18} color="#fff" />
                  <Text style={styles.photoEditText}>Change Photo</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="add-a-photo" size={32} color={colors.muted} />
              <Text style={[styles.photoPlaceholderText, { color: colors.muted }]}>Add Venue Photo</Text>
            </View>
          )}
        </Pressable>

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
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Enter venue address"
              placeholderTextColor={colors.muted}
              value={form.address}
              onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
              returnKeyType="done"
            />
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

          {/* Preferred Energy */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Preferred Energy</Text>
            <View style={styles.chipRow}>
              {ENERGY_TYPES.map((e) => {
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

          {/* Delete Venue */}
          <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.dangerTitle, { color: colors.error }]}>Danger Zone</Text>
            <Text style={[styles.dangerDesc, { color: colors.muted }]}>
              Permanently delete this venue and all its associated data. This action cannot be undone.
            </Text>
            <Pressable style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.9 : 1 }]} onPress={handleDelete}>
              <MaterialIcons name="delete" size={18} color="#fff" />
              <Text style={styles.deleteBtnText}>Delete Venue</Text>
            </Pressable>
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
  photoPlaceholder: { height: 140, marginHorizontal: 20, marginTop: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: { fontSize: 14, fontWeight: '600' },
  form: { padding: 20, gap: 20 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  fieldInputMulti: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#2563EB', borderRadius: 20 },
  headerSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerSection: { borderTopWidth: 1, paddingTop: 24, marginTop: 12, gap: 10 },
  dangerTitle: { fontSize: 16, fontWeight: '800' },
  dangerDesc: { fontSize: 13, lineHeight: 18 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  deleteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
