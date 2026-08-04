import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { TimeSelector } from '@/components/ui/time-picker';
import { DAY_MIN, makeEmptySet } from '@/lib/venue-schedule';
import type { VenueSchedule, VenueScheduleSet } from '@/lib/types';

interface ScheduleEditorProps {
  value: VenueSchedule;
  onChange: (next: VenueSchedule) => void;
}

/**
 * The venue "Programme" editor: a list of set cards. Each set carries its OWN days
 * (Monday-first toggles) and its OWN time range, so a night can hold several sets and
 * different nights can hold different sets. Pure controlled component — the parent owns
 * persistence (create-venue step / venue Schedule tab).
 */
export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  const colors = useColors();
  const [openTimeId, setOpenTimeId] = useState<string | null>(null);

  const patchSet = (id: string, patch: Partial<VenueScheduleSet>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const toggleDay = (set: VenueScheduleSet, day: number) =>
    patchSet(set.id, {
      days: set.days.includes(day)
        ? set.days.filter((d) => d !== day)
        : [...set.days, day].sort((a, b) => a - b),
    });

  const removeSet = (id: string) => onChange(value.filter((s) => s.id !== id));

  const addSet = () => {
    const s = makeEmptySet();
    onChange([...value, s]);
    setOpenTimeId(s.id);
  };

  return (
    <View>
      <Text style={[styles.label, { color: colors.muted }]}>PROGRAMME</Text>
      <Text style={[styles.desc, { color: colors.foreground }]}>
        The nights this venue books artists. Open nights appear on your calendar automatically.
      </Text>

      {value.map((set) => {
        const timeOpen = openTimeId === set.id;
        return (
          <View key={set.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardTop}>
              <View style={styles.days}>
                {DAY_MIN.map((d, i) => {
                  const on = set.days.includes(i);
                  return (
                    <Pressable
                      key={i}
                      onPress={() => toggleDay(set, i)}
                      style={[styles.dayChip, { backgroundColor: on ? colors.primary : colors.background }]}
                    >
                      <Text style={[styles.dayText, { color: on ? '#fff' : colors.muted }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => removeSet(set.id)} hitSlop={8} style={styles.trash}>
                <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => setOpenTimeId(timeOpen ? null : set.id)}
              style={[styles.timeRow, { borderTopColor: colors.border }]}
            >
              <Text style={[styles.timeText, { color: colors.foreground }]}>
                {set.startTime} – {set.endTime}
              </Text>
              <MaterialIcons name={timeOpen ? 'expand-less' : 'expand-more'} size={22} color={colors.muted} />
            </Pressable>

            {timeOpen && (
              <View style={styles.pickers}>
                <TimeSelector value={set.startTime} label="Start" onChange={(t) => patchSet(set.id, { startTime: t })} />
                <TimeSelector value={set.endTime} label="End" onChange={(t) => patchSet(set.id, { endTime: t })} />
              </View>
            )}
          </View>
        );
      })}

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
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  days: { flex: 1, flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: '700' },
  trash: { padding: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  timeText: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pickers: { flexDirection: 'row', gap: 12, marginTop: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginTop: 4 },
  addCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16, fontWeight: '700' },
});
