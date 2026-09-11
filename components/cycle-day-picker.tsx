import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

interface CycleDayPickerProps {
  value: number;
  onChange: (day: number) => void;
  /** Pill width (default 60). */
  width?: number;
  /** Open the menu UPWARD instead of downward — use when the control sits low on the screen so
   *  the list's end isn't clipped off the bottom. */
  dropUp?: boolean;
}

/**
 * A dropdown pill for choosing the billing-cycle end day (1-31). The menu floats OVER the
 * content instead of pushing it — matches the budget editor's month/year pickers.
 * The parent renders its own label; this is just the control.
 */
export function CycleDayPicker({ value, onChange, width = 60, dropUp = false }: CycleDayPickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative', zIndex: open ? 1000 : 1, alignSelf: 'flex-start', width }}>
      <Pressable
        style={[styles.pill, { borderColor: open ? colors.primary : colors.border, backgroundColor: colors.background }]}
        onPress={() => setOpen((o) => !o)}
      >
        <Text style={[styles.pillText, { color: colors.foreground }]}>{value}</Text>
        <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={[styles.dropdown, dropUp ? styles.dropUp : styles.dropDown, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 38 },
  pillText: { fontSize: 15, fontWeight: '700' },
  dropdown: {
    position: 'absolute', left: 0, right: 0, zIndex: 1000,
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 20,
  },
  dropDown: { top: '100%', marginTop: 6 },
  dropUp: { bottom: '100%', marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, minHeight: 42 },
  optionText: { fontSize: 15 },
});
