import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore, useVenueStore, useVenueFilterStore } from '@/lib/store';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';

// The shared venue-filter header used on the manager dashboard, calendar and roster. Shows the
// selected venue's name (or "All Venues") as the page title; tapping it opens the same
// venue-picker popup the old filter button used. Writes the ONE shared filter (useVenueFilterStore)
// so every screen updates together.
export function VenueFilterHeader() {
  const colors = useColors();
  const currentUser = useAuthStore((s) => s.currentUser);
  const allVenues = useVenueStore((s) => s.venues);
  const venueId = useVenueFilterStore((s) => s.venueId);
  const setVenueId = useVenueFilterStore((s) => s.setVenueId);
  const [open, setOpen] = useState(false);

  const venues = useMemo(
    () => allVenues.filter((v) => v.managerId === currentUser?.id && !v.isHidden),
    [allVenues, currentUser?.id]
  );
  const selected = venues.find((v) => v.id === venueId);
  const title = selected?.name ?? 'All Venues';

  return (
    <>
      <Pressable style={styles.titleBtn} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
        <MaterialIcons name="expand-more" size={24} color={venueId ? colors.primary : colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Filter by venue</Text>
            {[{ id: null as string | null, name: 'All venues' }, ...venues].map((v) => {
              const active = venueId === v.id;
              return (
                <Pressable
                  key={v.id ?? 'all'}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => { setVenueId(v.id); setOpen(false); }}
                >
                  <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{v.name}</Text>
                  {active && <MaterialIcons name="check" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  title: { fontSize: 24, fontFamily: fonts.displayBold, letterSpacing: -0.5, flexShrink: 1 },
  // Popup — kept identical to the old dashboard "Filter by venue" sheet.
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  sheet: { width: '100%', maxWidth: 320, borderRadius: 16, borderWidth: 1, padding: 18, gap: 4 },
  sheetTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 4 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
});
