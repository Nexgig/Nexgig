import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import { ScheduleEditor } from '@/components/schedule-editor';
import { ensureScheduleSlots, reconcileScheduleSlots } from '@/lib/venue-schedule-sync';
import { todayLocalStr, addDaysStr } from '@/lib/utils';
import type { VenueSchedule } from '@/lib/types';

export default function EditSchedule() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = useVenueStore((s) => s.venues.find((v) => v.id === id));
  const updateVenue = useVenueStore((s) => s.updateVenue);

  const [schedule, setSchedule] = useState<VenueSchedule>(venue?.schedule ?? []);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(schedule) !== JSON.stringify(venue?.schedule ?? []),
    [schedule, venue?.schedule]
  );

  if (!venue) {
    return (
      <ScreenContainer edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Schedule</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.muted }}>Venue not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    updateVenue(venue.id, { schedule });
    const { error } = await supabase
      .from('venues')
      .update({ schedule, updated_at: new Date().toISOString() })
      .eq('id', venue.id);
    if (error) {
      setSaving(false);
      Alert.alert('Could not save', 'Please try again.');
      return;
    }
    // Drop empty future nights that no longer match, then fill the new ones for a horizon
    // so the change shows on the calendar immediately (never touches booked nights).
    await reconcileScheduleSlots(venue.id);
    const today = todayLocalStr();
    await ensureScheduleSlots(today, addDaysStr(today, 60));
    setSaving(false);
    router.back();
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={6}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{venue.name}</Text>
        <Pressable onPress={handleSave} disabled={saving} hitSlop={8} style={styles.saveBtn}>
          <Text style={[styles.saveText, { color: colors.primary, opacity: saving ? 0.4 : 1 }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '800', marginLeft: 4 },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  saveText: { fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
});
