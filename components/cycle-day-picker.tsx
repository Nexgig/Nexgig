import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

interface CycleDayPickerProps {
  value: number;
  onChange: (day: number) => void;
}

/**
 * A dropdown pill for choosing the billing-cycle end day (1-31). The menu floats OVER the
 * content below instead of pushing it — matches the budget editor's month/year pickers.
 * The parent renders its own label; this is just the control.
 */
export function CycleDayPicker({ value, onChange }: CycleDayPickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative', zIndex: open ? 1000 : 1, alignSelf: 'flex-start', width: 180 }}>
      <Pressable
        style={[styles.pill, { borderColor: open ? colors.primary : colors.border, backgroundColor: colors.background }]}
        onPress={() => setOpen((o) => !o)}
      >
        <Text style={[styles.pillText, { color: colors.foreground }]}>{value}</Text>
        <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 176 }} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const sel = value === day;
              return (
                <Pressable
                  key={day}
                  style={[styles.option, sel && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => { onChange(day); setOpen(false); }}
                >
                  <Text style={[styles.optionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{day}</Text>
                  {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 46 },
  pillText: { fontSize: 15, fontWeight: '700' },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 1000,
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 20,
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11, minHeight: 42 },
  optionText: { fontSize: 15 },
});
