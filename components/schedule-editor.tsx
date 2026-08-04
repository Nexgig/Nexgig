import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { TimeSelector } from '@/components/ui/time-picker';
import { DAY_MIN, DAY_FULL, setsForDay, daysWithSets, makeSetForDay } from '@/lib/venue-schedule';
import type { VenueSchedule, VenueScheduleSet } from '@/lib/types';

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
  const [openTimeId, setOpenTimeId] = useState<string | null>(null);

  const filled = daysWithSets(value);
  const daySets = setsForDay(value, selectedDay);

  const patchSet = (id: string, patch: Partial<VenueScheduleSet>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSet = (id: string) => onChange(value.filter((s) => s.id !== id));
  const addSet = () => {
    const s = makeSetForDay(selectedDay);
    onChange([...value, s]);
    setOpenTimeId(s.id);
  };

  return (
    <View>
      <Text style={[styles.label, { color: colors.muted }]}>PROGRAMME</Text>
      <Text style={[styles.desc, { color: colors.foreground }]}>
        The nights this venue books artists. Open nights appear on your calendar automatically.
      </Text>

      {/* Day picker — a dot marks days that already have sets, so you can see the whole
          week's shape while hopping between days. */}
      <View style={styles.days}>
        {DAY_MIN.map((d, i) => {
          const on = selectedDay === i;
          const has = filled.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => { setSelectedDay(i); setOpenTimeId(null); }}
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
          const timeOpen = openTimeId === set.id;
          return (
            <View key={set.id} style={[styles.setCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.setTop}>
                <Pressable style={styles.setTimeBtn} onPress={() => setOpenTimeId(timeOpen ? null : set.id)}>
                  <Text style={[styles.setTime, { color: colors.foreground }]}>{set.startTime} – {set.endTime}</Text>
                  <MaterialIcons name={timeOpen ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => removeSet(set.id)} hitSlop={8} style={styles.trash}>
                  <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
                </Pressable>
              </View>
              {timeOpen && (
                <View style={styles.pickers}>
                  <TimeSelector value={set.startTime} label="Start" onChange={(t) => patchSet(set.id, { startTime: t })} />
                  <TimeSelector value={set.endTime} label="End" onChange={(t) => patchSet(set.id, { endTime: t })} />
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
  setCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 },
  setTop: { flexDirection: 'row', alignItems: 'center' },
  setTimeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  setTime: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  trash: { padding: 6 },
  pickers: { flexDirection: 'row', gap: 12, paddingBottom: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginTop: 4 },
  addCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16, fontWeight: '700' },
});
