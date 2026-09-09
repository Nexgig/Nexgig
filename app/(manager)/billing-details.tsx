import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';

export default function BillingDetails() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = useVenueStore((s) => s.venues.find((v) => v.id === id));
  const updateVenue = useVenueStore((s) => s.updateVenue);

  const [companyName, setCompanyName] = useState(venue?.billing?.companyName ?? '');
  const [companyAddress, setCompanyAddress] = useState(venue?.billing?.companyAddress ?? '');
  const [trnNumber, setTrnNumber] = useState(venue?.billing?.trnNumber ?? '');
  const [cycleDay, setCycleDay] = useState<number>(venue?.billingCycleEndDay ?? 31);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => (
    companyName !== (venue?.billing?.companyName ?? '') ||
    companyAddress !== (venue?.billing?.companyAddress ?? '') ||
    trnNumber !== (venue?.billing?.trnNumber ?? '') ||
    cycleDay !== (venue?.billingCycleEndDay ?? 31)
  ), [companyName, companyAddress, trnNumber, cycleDay, venue]);

  if (!venue) {
    return (
      <ScreenContainer edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Billing</Text>
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
    const billing = (companyName.trim() || trnNumber.trim())
      ? { companyName: companyName.trim(), companyAddress: companyAddress.trim(), trnNumber: trnNumber.trim() }
      : undefined;
    updateVenue(venue.id, { billing, billingCycleEndDay: cycleDay });
    const { error } = await supabase.from('venues').update({
      billing_company_name: companyName.trim() || null,
      billing_company_address: companyAddress.trim() || null,
      billing_trn_number: trnNumber.trim() || null,
      billing_cycle_end_day: cycleDay,
      updated_at: new Date().toISOString(),
    }).eq('id', venue.id);
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
        <Text style={[styles.intro, { color: colors.muted }]}>These details will appear on invoices sent by artists for this venue.</Text>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Company / Legal Name</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Beach Club LLC" placeholderTextColor={colors.muted} value={companyName} onChangeText={setCompanyName} returnKeyType="done" />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Company Address</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. Dubai Marina, Dubai" placeholderTextColor={colors.muted} value={companyAddress} onChangeText={setCompanyAddress} returnKeyType="done" />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>TRN Number</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} placeholder="e.g. 100XXXXXXXXX003" placeholderTextColor={colors.muted} value={trnNumber} onChangeText={setTrnNumber} keyboardType="number-pad" returnKeyType="done" />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Billing cycle ends on</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.dayRow} keyboardShouldPersistTaps="handled">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const active = cycleDay === day;
              return (
                <Pressable key={day} onPress={() => setCycleDay(day)} style={[styles.dayBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}>
                  <Text style={[styles.dayText, { color: active ? '#fff' : colors.foreground }]}>{day}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Your billing month for this venue ends on this day. 31 = the last day of each month (the normal calendar month).</Text>
        </View>
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
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 20 },
  intro: { fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  dayRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  dayBtn: { minWidth: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dayText: { fontSize: 15, fontWeight: '700' },
});
