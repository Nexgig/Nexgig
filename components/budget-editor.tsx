import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import type { VenueMonthlyBudget } from '@/lib/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface BudgetEditorProps {
  value: VenueMonthlyBudget[];
  onChange: (next: VenueMonthlyBudget[]) => void;
}

/**
 * Per-month budget editor. Add a month with the + button; each entry has a month picker, a
 * year picker and an AED amount. Entries are grouped under year headers so a venue's budgets
 * read year-by-year. Pure controlled component — the parent owns Save/persistence.
 */
export function BudgetEditor({ value, onChange }: BudgetEditorProps) {
  const colors = useColors();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1-12
  const YEARS = [curYear - 1, curYear, curYear + 1, curYear + 2];
  // Which dropdown is open: `${idx}:month` | `${idx}:year` | null.
  const [open, setOpen] = useState<string | null>(null);

  // Keep the original array index so edits/removes map back to `value` even after grouping.
  const view = value
    .map((b, idx) => ({ ...b, _idx: idx }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const years = [...new Set(view.map((v) => v.year))];
  // Which entry/year currently has a dropdown open — used to lift it above sibling rows so the
  // menu floats OVER the content below instead of stretching the card.
  const openIdx = open != null ? Number(open.split(':')[0]) : -1;
  const openYear = openIdx >= 0 ? value[openIdx]?.year : undefined;

  const patch = (idx: number, p: Partial<VenueMonthlyBudget>) =>
    onChange(value.map((b, i) => (i === idx ? { ...b, ...p } : b)));
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () => {
    // Default to the month AFTER the latest budget already set (rolling the year at December);
    // if there are none yet, to the current month. Then skip any month already used. So it never
    // defaults to January just because the year is empty — it opens the next sensible month.
    let year = curYear;
    let month = curMonth;
    if (value.length > 0) {
      const latest = value.reduce((a, b) => (b.year * 12 + b.month > a.year * 12 + a.month ? b : a));
      year = latest.year;
      month = latest.month + 1;
      if (month > 12) { month = 1; year += 1; }
    }
    const used = new Set(value.map((b) => b.year * 12 + b.month));
    while (used.has(year * 12 + month)) { month += 1; if (month > 12) { month = 1; year += 1; } }
    onChange([...value, { year, month, amount: 0 }]);
    setOpen(null);
  };

  // A dropdown pill (month or year), matching the schedule editor's time pills.
  const pill = (
    idx: number,
    field: 'month' | 'year',
    label: string,
    display: string,
    options: { key: number; text: string }[],
    current: number,
  ) => {
    const key = `${idx}:${field}`;
    const isOpen = open === key;
    return (
      <View style={{ flex: field === 'month' ? 1.4 : 1, zIndex: isOpen ? 1000 : 1 }}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
        <View style={{ position: 'relative' }}>
          <Pressable
            style={[styles.pill, { borderColor: isOpen ? colors.primary : colors.border, backgroundColor: colors.background }]}
            onPress={() => setOpen(isOpen ? null : key)}
          >
            <Text style={[styles.pillText, { color: colors.foreground }]} numberOfLines={1}>{display}</Text>
            <MaterialIcons name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
          </Pressable>
          {isOpen && (
            <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 168 }} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {options.map((o) => {
                  const sel = current === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      style={[styles.option, sel && { backgroundColor: colors.primary + '15' }]}
                      onPress={() => { patch(idx, field === 'month' ? { month: o.key } : { year: o.key }); setOpen(null); }}
                    >
                      <Text style={[styles.optionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{o.text}</Text>
                      {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View>
      <Text style={[styles.intro, { color: colors.muted }]}>
        Set a spend target per month. The calendar shows your bookings against the matching month’s budget. Only you see this.
      </Text>

      {view.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No budgets yet. Add a month below.</Text>
      ) : (
        years.map((year) => (
          <View key={year} style={[{ marginBottom: 6 }, year === openYear && { zIndex: 1000 }]}>
            <Text style={[styles.yearHeading, { color: colors.foreground }]}>{year}</Text>
            {view.filter((v) => v.year === year).map((entry) => (
              <View key={entry._idx} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, entry._idx === openIdx && styles.cardRaised]}>
                <View style={[styles.topRow, entry._idx === openIdx && { zIndex: 1000 }]}>
                  {pill(entry._idx, 'month', 'MONTH', MONTHS[entry.month - 1], MONTHS.map((m, i) => ({ key: i + 1, text: m })), entry.month)}
                  {pill(entry._idx, 'year', 'YEAR', String(entry.year), YEARS.map((y) => ({ key: y, text: String(y) })), entry.year)}
                  <Pressable onPress={() => remove(entry._idx)} hitSlop={8} style={styles.trash}>
                    <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
                  </Pressable>
                </View>
                <View style={styles.amountRow}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>BUDGET (AED)</Text>
                  <View style={[styles.amountWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.amountCurrency, { color: colors.muted }]}>AED</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.foreground }]}
                      value={entry.amount > 0 ? String(entry.amount) : ''}
                      onChangeText={(t) => {
                        const digits = t.replace(/[^0-9]/g, '');
                        patch(entry._idx, { amount: digits === '' ? 0 : parseInt(digits, 10) });
                      }}
                      placeholder="e.g. 20000"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      <Pressable onPress={add} style={styles.addRow}>
        <View style={[styles.addCircle, { borderColor: colors.primary }]}>
          <MaterialIcons name="add" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.addText, { color: colors.primary }]}>Add a month</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  empty: { fontSize: 14, marginBottom: 4 },
  yearHeading: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  cardRaised: { zIndex: 1000, elevation: 20 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 },
  pillText: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 1000,
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 20,
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, minHeight: 38 },
  optionText: { fontSize: 15 },
  trash: { padding: 6, marginBottom: 2 },
  amountRow: { marginTop: 10 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 42 },
  amountCurrency: { fontSize: 13, fontWeight: '700' },
  amountInput: { flex: 1, fontSize: 15, fontWeight: '700', paddingVertical: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginTop: 4 },
  addCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16, fontWeight: '700' },
});
