import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { DAY_MIN, DAY_FULL, daysWithSets, makeSetForDay } from '@/lib/venue-schedule';
import type { VenueSchedule, VenueScheduleSet } from '@/lib/types';

// Same 30-min grid the add-slot picker uses.
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`);
}

interface ScheduleEditorProps {
  value: VenueSchedule;
  onChange: (next: VenueSchedule) => void;
}

/**
 * Day-first programme editor. Pick a weekday up top; its sets appear underneath. Add
 * several sets to a day, hop to another day, repeat. Each set belongs to one day and
 * carries its own time. Pure controlled component — the parent owns Save/persistence.
 */
export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  const colors = useColors();
  const [selectedDay, setSelectedDay] = useState(0); // Mon
  // Which time dropdown is open: `${setId}:start` | `${setId}:end` | null.
  const [openTime, setOpenTime] = useState<string | null>(null);

  const filled = daysWithSets(value);
  // Insertion order (newest at the bottom) — NOT sorted by time. Sorting the editor live meant a
  // card jumped position the instant you changed its start time (edit 5pm → it leaps above the
  // 9pm card), which is disorienting and caused mis-edits. The schedule is still shown and
  // materialized chronologically elsewhere (both use setsForDay); only the editor stays put.
  const daySets = value.filter((s) => s.day === selectedDay);

  const patchSet = (id: string, patch: Partial<VenueScheduleSet>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSet = (id: string) => onChange(value.filter((s) => s.id !== id));
  const addSet = () => {
    const s = makeSetForDay(selectedDay);
    onChange([...value, s]);
    setOpenTime(null);
  };

  // One time-pill (add-slot look): clock · time · chevron. `field` is 'start' | 'end'.
  const timePill = (set: VenueScheduleSet, field: 'start' | 'end') => {
    const key = `${set.id}:${field}`;
    const open = openTime === key;
    const val = field === 'start' ? set.startTime : set.endTime;
    return (
      <View style={{ flex: 1 }}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{field === 'start' ? 'START' : 'END'}</Text>
        <Pressable
          style={[styles.pill, { borderColor: open ? colors.primary : colors.border, backgroundColor: colors.background }]}
          onPress={() => setOpenTime(open ? null : key)}
        >
          <MaterialIcons name="access-time" size={14} color={open ? colors.primary : colors.muted} />
          <Text style={[styles.pillText, { color: colors.foreground }]}>{val}</Text>
          <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={colors.muted} />
        </Pressable>
      </View>
    );
  };

  return (
    <View>
      {/* Day picker — a dot marks days that already have sets. */}
      <View style={styles.days}>
        {DAY_MIN.map((d, i) => {
          const on = selectedDay === i;
          const has = filled.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => { setSelectedDay(i); setOpenTime(null); }}
              style={[styles.dayChip, { backgroundColor: on ? colors.primary : colors.surface }]}
            >
              <Text style={[styles.dayText, { color: on ? '#fff' : colors.muted }]}>{d}</Text>
              <View style={[styles.dayDot, { backgroundColor: has ? (on ? '#fff' : colors.primary) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.dayHeading, { color: colors.foreground }]}>{DAY_FULL[selectedDay]}</Text>

      {daySets.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No sets yet. Add one below.</Text>
      ) : (
        daySets.map((set) => {
          const openField: 'start' | 'end' | null =
            openTime === `${set.id}:start` ? 'start' : openTime === `${set.id}:end` ? 'end' : null;
          const current = openField === 'start' ? set.startTime : set.endTime;
          return (
            <View key={set.id} style={[styles.setCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.setTop}>
                <View style={styles.timeRow}>
                  {timePill(set, 'start')}
                  <View style={styles.timeSep}><MaterialIcons name="arrow-forward" size={16} color={colors.muted} /></View>
                  {timePill(set, 'end')}
                </View>
                <Pressable onPress={() => removeSet(set.id)} hitSlop={8} style={styles.trash}>
                  <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
                </Pressable>
              </View>

              {openField && (
                <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <ScrollView style={{ maxHeight: 168 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {TIME_OPTIONS.map((t) => {
                      const sel = current === t;
                      return (
                        <Pressable
                          key={t}
                          style={[styles.option, sel && { backgroundColor: colors.primary + '15' }]}
                          onPress={() => { patchSet(set.id, openField === 'start' ? { startTime: t } : { endTime: t }); setOpenTime(null); }}
                        >
                          <Text style={[styles.optionText, { color: sel ? colors.primary : colors.foreground, fontWeight: sel ? '700' : '400' }]}>{t}</Text>
                          {sel && <MaterialIcons name="check" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          );
        })
      )}

      <Pressable onPress={addSet} style={styles.addRow}>
        <View style={[styles.addCircle, { borderColor: colors.primary }]}>
          <MaterialIcons name="add" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.addText, { color: colors.primary }]}>Add a set</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  desc: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  days: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dayChip: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayText: { fontSize: 15, fontWeight: '700' },
  dayDot: { width: 5, height: 5, borderRadius: 2.5 },
  dayHeading: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  empty: { fontSize: 14, marginBottom: 4 },
  setCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  setTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  timeSep: { paddingTop: 28 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 },
  pillText: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  trash: { padding: 6, marginBottom: 2 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, minHeight: 38 },
  optionText: { fontSize: 15 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginTop: 4 },
  addCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16, fontWeight: '700' },
});
