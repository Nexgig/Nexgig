import { View, Text, Pressable, StyleSheet } from '@/lib/rn';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

// Quick-action sheet opened by the center "+" in the manager tab bar. Presented as a NATIVE
// form sheet (see the manager _layout Stack.Screen options) so it matches Add Slot. The date +
// venue for Add Slot are resolved by the tab layout and passed in as params.
export default function QuickActionsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { slotDate, venueId } = useLocalSearchParams<{ slotDate?: string; venueId?: string }>();

  const addSlot = () => {
    const date = (typeof slotDate === 'string' && slotDate) ? slotDate : new Date().toISOString().slice(0, 10);
    const q = 'date=' + date + (venueId ? '&venueId=' + venueId : '');
    router.replace(('/(manager)/add-slot?' + q) as Href);
  };
  const createVenue = () => router.replace('/(manager)/create-venue' as Href);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActionRow icon="event" label="Add Slot" colors={colors} onPress={addSlot} />
      <View style={[styles.sep, { backgroundColor: colors.border }]} />
      <ActionRow icon="add-business" label="Create Venue" colors={colors} onPress={createVenue} />
    </View>
  );
}

function ActionRow({ icon, label, colors, onPress }: {
  icon: any; label: string; colors: ReturnType<typeof useColors>; onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]} onPress={onPress}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 14, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600' },
});
