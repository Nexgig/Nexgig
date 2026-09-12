import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import { BudgetEditor } from '@/components/budget-editor';
import { normalizeBudgets } from '@/lib/venue-budget';
import { saveVenuePrivate } from '@/lib/venue-private';
import type { VenueMonthlyBudget } from '@/lib/types';

export default function EditBudget() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = useVenueStore((s) => s.venues.find((v) => v.id === id));
  const updateVenue = useVenueStore((s) => s.updateVenue);

  const [budgets, setBudgets] = useState<VenueMonthlyBudget[]>(venue?.monthlyBudgets ?? []);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(normalizeBudgets(budgets)) !== JSON.stringify(normalizeBudgets(venue?.monthlyBudgets ?? [])),
    [budgets, venue?.monthlyBudgets]
  );

  if (!venue) {
    return (
      <ScreenContainer edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Budget</Text>
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
    const clean = normalizeBudgets(budgets);
    updateVenue(venue.id, { monthlyBudgets: clean });
    // Budgets live in the manager-only venue_private table, not on the venue row.
    const { error } = await saveVenuePrivate(venue.id, venue.managerId, { monthlyBudgets: clean });
    if (error) {
      setSaving(false);
      Alert.alert('Could not save', 'Please try again.');
      return;
    }
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
        <Pressable onPress={handleSave} disabled={saving || !dirty} hitSlop={8} style={styles.saveBtn}>
          <Text style={[styles.saveText, { color: colors.primary, opacity: saving || !dirty ? 0.4 : 1 }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <BudgetEditor value={budgets} onChange={setBudgets} />
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
