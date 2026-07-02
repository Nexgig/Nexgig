import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Keyboard } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore, useSlotStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { isPastStart } from '@/lib/utils';
import type { Slot } from '@/lib/types';

const SLOT_PRESETS = [
  { name: 'Day', start: '13:00', end: '17:00' },
  { name: 'Sunset', start: '17:00', end: '21:00' },
  { name: 'Night', start: '21:00', end: '01:00' },
] as const;

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}

export default function AddSlotScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { date, venueId } = useLocalSearchParams<{ date?: string; venueId?: string }>();

  const allVenues = useVenueStore((s) => s.venues);
  const addSlot = useSlotStore((s) => s.addSlot);

  const venues = allVenues.filter((v) => !v.isHidden);
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const [createSlotVenueId, setCreateSlotVenueId] = useState<string>(venueId ?? venues[0]?.id ?? '');
  const [slotForm, setSlotForm] = useState({ name: '', startTime: '20:00', endTime: '00:00' });
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);

  const startTimeScrollRef = useRef<ScrollView>(null);
  const endTimeScrollRef = useRef<ScrollView>(null);

  const scrollToTimeOption = (ref: React.RefObject<ScrollView | null>, time: string) => {
    const idx = TIME_OPTIONS.indexOf(time);
    if (idx >= 0 && ref.current) {
      setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, idx * 36 - 72), animated: false }), 80);
    }
  };

  const headerTitle = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const handleSaveSlot = async (assignNow = false) => {
    const targetVenueId = createSlotVenueId;
    if (!targetVenueId) { Alert.alert('Required', 'Please select a venue.'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Error', 'Not authenticated.'); return; }

    const { data: slotData, error } = await supabase.from('slots').insert({
      venue_id: targetVenueId,
      manager_id: user.id,
      name: slotForm.name,
      date: targetDate,
      start_time: slotForm.startTime,
      end_time: slotForm.endTime,
      status: 'open',
    }).select().single();

    if (error) { Alert.alert('Error creating slot', error.message); return; }

    const newSlot: Slot = {
      id: slotData.id,
      venueId: targetVenueId,
      name: slotForm.name,
      date: targetDate,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      createdAt: new Date().toISOString(),
    };
    addSlot(newSlot);

    if (assignNow || isPastStart(targetDate, slotForm.startTime)) {
      router.replace(`/(manager)/assign-artist?slotId=${slotData.id}` as Href);
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, flex: 1 }]}>
      <View style={styles.header}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{headerTitle}</Text>
        <Pressable
          style={[styles.closeBtn, { backgroundColor: colors.surface }]}
          onPress={() => { Keyboard.dismiss(); router.back(); }}
          hitSlop={8}
        >
          <MaterialIcons name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>VENUE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillRow}>
            {venues.map((v) => {
              const sel = createSlotVenueId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setCreateSlotVenueId(v.id)}
                  style={[styles.venuePill, { backgroundColor: sel ? colors.primary : 'transparent', borderColor: sel ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.venuePillText, { color: sel ? '#fff' : colors.foreground }]} numberOfLines={1}>{v.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>SET TIME</Text>
          <View style={styles.presetRow}>
            {SLOT_PRESETS.map((preset) => (
              <Pressable
                key={preset.name}
                onPress={() => setSlotForm((f) => ({ ...f, name: preset.name, startTime: preset.start, endTime: preset.end }))}
                style={({ pressed }) => [styles.presetChip, {
                  backgroundColor: slotForm.name === preset.name ? colors.primary + '18' : colors.surface,
                  borderColor: slotForm.name === preset.name ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={[styles.presetChipText, { color: slotForm.name === preset.name ? colors.primary : colors.foreground, fontWeight: slotForm.name === preset.name ? '700' : '500' }]}>{preset.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>START</Text>
            <View style={{ position: 'relative', zIndex: startTimeOpen ? 20 : 1 }}>
              <Pressable
                style={[styles.timeDropdownBtn, { backgroundColor: colors.surface, borderColor: startTimeOpen ? colors.primary : colors.border }]}
                onPress={() => { Keyboard.dismiss(); setStartTimeOpen(!startTimeOpen); setEndTimeOpen(false); }}
              >
                <MaterialIcons name="access-time" size={14} color={startTimeOpen ? colors.primary : colors.muted} />
                <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{slotForm.startTime}</Text>
                <MaterialIcons name={startTimeOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
              </Pressable>
              {startTimeOpen && (
                <View style={[styles.timeDropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ScrollView ref={startTimeScrollRef} onLayout={() => scrollToTimeOption(startTimeScrollRef, slotForm.startTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {TIME_OPTIONS.map((t) => {
                      const isSelected = slotForm.startTime === t;
                      return (
                        <Pressable key={t} style={[styles.timeOption, isSelected && { backgroundColor: colors.primary + '15' }]} onPress={() => { setSlotForm((f) => ({ ...f, startTime: t })); setStartTimeOpen(false); }}>
                          <Text style={[styles.timeOptionText, { color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '700' : '400' }]}>{t}</Text>
                          {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <View style={styles.timeSep}>
            <MaterialIcons name="arrow-forward" size={16} color={colors.muted} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>END</Text>
            <View style={{ position: 'relative', zIndex: endTimeOpen ? 20 : 1 }}>
              <Pressable
                style={[styles.timeDropdownBtn, { backgroundColor: colors.surface, borderColor: endTimeOpen ? colors.primary : colors.border }]}
                onPress={() => { Keyboard.dismiss(); setEndTimeOpen(!endTimeOpen); setStartTimeOpen(false); }}
              >
                <MaterialIcons name="access-time" size={14} color={endTimeOpen ? colors.primary : colors.muted} />
                <Text style={[styles.timeDropdownText, { color: colors.foreground }]}>{slotForm.endTime}</Text>
                <MaterialIcons name={endTimeOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
              </Pressable>
              {endTimeOpen && (
                <View style={[styles.timeDropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ScrollView ref={endTimeScrollRef} onLayout={() => scrollToTimeOption(endTimeScrollRef, slotForm.endTime)} style={styles.timeDropdownScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {TIME_OPTIONS.map((t) => {
                      const isSelected = slotForm.endTime === t;
                      return (
                        <Pressable key={t} style={[styles.timeOption, isSelected && { backgroundColor: colors.primary + '15' }]} onPress={() => { setSlotForm((f) => ({ ...f, endTime: t })); setEndTimeOpen(false); }}>
                          <Text style={[styles.timeOptionText, { color: isSelected ? colors.primary : colors.foreground, fontWeight: isSelected ? '700' : '400' }]}>{t}</Text>
                          {isSelected && <MaterialIcons name="check" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.ctaRow, { paddingBottom: Math.max(insets.bottom, 16), flexDirection: 'column', gap: 10 }]}>
          <Pressable style={({ pressed }) => [styles.ctaBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleSaveSlot(true)}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>Assign Artist Now</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.ctaBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]} onPress={() => handleSaveSlot(false)}>
            <Text style={[styles.ctaBtnText, { color: colors.foreground }]}>Create</Text>
          </Pressable>
        </View>
        <View style={{ flexGrow: 1, minHeight: 300, backgroundColor: colors.background }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 13, paddingTop: 8, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6, paddingRight: 4, alignItems: 'center' },
  venuePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, minHeight: 34 },
  venuePillText: { fontSize: 12, fontWeight: '600', includeFontPadding: false },
  presetRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  presetChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, minHeight: 30, justifyContent: 'center', alignItems: 'center' },
  presetChipText: { fontSize: 12, includeFontPadding: false },
  timeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  timeSep: { paddingTop: 28 },
  timeDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 },
  timeDropdownText: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  timeDropdownAbsolute: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 },
  timeDropdownList: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  timeDropdownScroll: { maxHeight: 160 },
  timeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  timeOptionText: { fontSize: 14 },
  ctaRow: { paddingTop: 10 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 14, minHeight: 48 },
  ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
});
