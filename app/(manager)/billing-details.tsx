import { useMemo, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert } from '@/lib/rn';
import { Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { MaterialIcons } from '@expo/vector-icons';
import { useVenueStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { supabase } from '@/lib/supabase';
import { saveVenuePrivate } from '@/lib/venue-private';
import { CycleDayPicker } from '@/components/cycle-day-picker';

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
  const [billingEmails, setBillingEmails] = useState<string[]>(venue?.billingEmails ?? []);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [cyclePickerOpen, setCyclePickerOpen] = useState(false);
  // When the day picker opens, drop the keyboard and reserve space so its (downward) list scrolls
  // fully into view even when the emails list has pushed it low.
  const onCyclePickerToggle = (open: boolean) => {
    setCyclePickerOpen(open);
    if (open) { Keyboard.dismiss(); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80); }
  };

  const dirty = useMemo(() => (
    companyName !== (venue?.billing?.companyName ?? '') ||
    companyAddress !== (venue?.billing?.companyAddress ?? '') ||
    trnNumber !== (venue?.billing?.trnNumber ?? '') ||
    cycleDay !== (venue?.billingCycleEndDay ?? 31) ||
    JSON.stringify(billingEmails) !== JSON.stringify(venue?.billingEmails ?? [])
  ), [companyName, companyAddress, trnNumber, cycleDay, billingEmails, venue]);

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
    // Trim, lower-case, drop blanks, de-dupe — the array persisted to billing_emails.
    const cleanEmails = Array.from(new Set(billingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
    updateVenue(venue.id, { billing, billingCycleEndDay: cycleDay, billingEmails: cleanEmails });
    const { error } = await supabase.from('venues').update({
      billing_company_name: companyName.trim() || null,
      billing_company_address: companyAddress.trim() || null,
      billing_trn_number: trnNumber.trim() || null,
      billing_cycle_end_day: cycleDay,
      updated_at: new Date().toISOString(),
    }).eq('id', venue.id);
    // Billing emails live in the manager-only venue_private table, not on the venue row.
    const { error: privErr } = await saveVenuePrivate(venue.id, venue.managerId, { billingEmails: cleanEmails });
    if (error || privErr) {
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

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, cyclePickerOpen && styles.contentPickerOpen]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          <Text style={[styles.label, { color: colors.foreground }]}>Billing emails</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Where invoices for this venue are sent. Add one or more. If left empty, invoices go to your login email.</Text>
          {billingEmails.map((email, i) => (
            <View key={i} style={styles.emailRow}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. accounts@venue.com"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={(t) => setBillingEmails((prev) => prev.map((e, j) => (j === i ? t : e)))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Pressable onPress={() => setBillingEmails((prev) => prev.filter((_, j) => j !== i))} hitSlop={8} style={styles.emailTrash}>
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => setBillingEmails((prev) => [...prev, ''])} hitSlop={8} style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="add" size={18} color={colors.primary} />
            <Text style={[styles.addText, { color: colors.primary }]}>{billingEmails.length > 0 ? 'Add another email' : 'Add an email'}</Text>
          </Pressable>
        </View>

        <View style={[styles.cycleRow, { zIndex: 10 }]}>
          <Text style={[styles.label, { color: colors.foreground }]}>Billing cycle ends on</Text>
          <CycleDayPicker value={cycleDay} onChange={setCycleDay} width={76} onOpenChange={onCyclePickerToggle} />
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
  contentPickerOpen: { paddingBottom: 260 }, // room for the open day list to scroll fully into view
  intro: { fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 8 },
  cycleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emailTrash: { padding: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  addText: { fontSize: 15, fontWeight: '700' },
});
