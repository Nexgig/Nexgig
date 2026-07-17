import { ScrollView, Pressable, Text, StyleSheet } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';

export type VenueChip = { id: string; name: string };

/**
 * Horizontal, scrollable venue-filter chip row for the booking-list screens (both
 * sides). "All" plus one chip per venue present in the list. Selecting scopes the list
 * to that venue; selecting All clears it.
 *
 * Renders nothing when there's 0 or 1 venue — a filter with one option is just noise.
 * The caller derives `venues` from the list it's already showing, so chips only ever
 * appear for venues that actually have bookings on that screen.
 */
export function VenueFilterRow({
  venues,
  selectedId,
  onSelect,
}: {
  venues: VenueChip[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const colors = useColors();
  if (venues.length < 2) return null;

  const items: VenueChip[] = [{ id: '__all__', name: 'All' }, ...venues];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {items.map((v) => {
        const isAll = v.id === '__all__';
        const on = isAll ? selectedId === null : selectedId === v.id;
        return (
          <Pressable
            key={v.id}
            onPress={() => onSelect(isAll ? null : v.id)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.chipText, { color: on ? '#FFFFFF' : colors.foreground }]} numberOfLines={1}>
              {v.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, maxWidth: 180 },
  chipText: { fontSize: 13, fontWeight: '600' },
});
