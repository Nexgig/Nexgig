import { View, Text, Pressable } from '@/lib/rn';
import { StyleSheet, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useColors } from '@/hooks/use-colors';

/**
 * Card-free layout primitives for the Nexgig redesign.
 *
 * Philosophy: content sits directly on `background` (white in light mode),
 * grouped under small uppercase labels and separated by hairline dividers —
 * NO surface boxes, NO borders around groups. Replaces the old `styles.card`
 * (surface + border) blocks across the app.
 *
 * NOTE: card-free kills the GROUPING wrapper only. A control's own fill stays —
 * text inputs, dropdowns, the search field, the segmented track and chips all
 * keep their `colors.surface` fill (that's an affordance, not a card).
 *
 * Gutters are 24px throughout, matching HANDOFF.md + the HTML canvases.
 *
 * Drop-in: uses the same `useColors()` + StyleSheet approach as the rest of the
 * app, so these compose with existing screens without a NativeWind refactor.
 */

const GUTTER = 24;

/** 11px uppercase group label. Precedes each Section's content. */
export function SectionLabel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.muted }]}>{children}</Text>;
}

/** 1px hairline. `full` bleeds edge-to-edge; default is inset to the 24px gutter. */
export function Divider({ full = false }: { full?: boolean }) {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border, marginHorizontal: full ? 0 : GUTTER }]} />;
}

/** A titled, box-free content group. Wrap fields/rows in it. */
export function Section({ label, children, style }: { label?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.section, style]}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
    </View>
  );
}

/** Instagram-style inline stat row (replaces the boxed stat tiles). */
export function StatRow({ items }: { items: { value: string | number; label: string; color?: string }[] }) {
  const colors = useColors();
  return (
    <View style={styles.statRow}>
      {items.map((it, i) => (
        <View key={it.label} style={styles.statCell}>
          {i > 0 && <View style={[styles.statSep, { backgroundColor: colors.border }]} />}
          <Text style={[styles.statValue, { color: it.color ?? colors.foreground }]}>{it.value}</Text>
          <Text style={[styles.statCaption, { color: colors.muted }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Generic open list row: [leading] · title + subtitle · [trailing]. */
export function ListRow({
  leading, title, subtitle, titleAccessory, trailing, onPress, divider = true,
}: {
  leading?: ReactNode; title: string; subtitle?: string;
  titleAccessory?: ReactNode; trailing?: ReactNode;
  onPress?: () => void; divider?: boolean;
}) {
  const colors = useColors();

  // NOTE: a plain <View> does NOT accept a function as `style` (only Pressable
  // does). Passing one silently drops the style, which killed flexDirection:'row'
  // and stacked every row vertically. So branch explicitly.
  const content = (
    <>
      {leading}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
          {titleAccessory}
        </View>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </>
  );

  return (
    <>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed ? { opacity: 0.6 } : null]}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
      {divider ? <Divider full /> : null}
    </>
  );
}

/** Rounded coral-tint icon tile (venue / date rows). */
export function IconTile({ icon, size = 48 }: { icon: keyof typeof MaterialIcons.glyphMap; size?: number }) {
  const colors = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '20' }}>
      <MaterialIcons name={icon} size={size * 0.46} color={colors.primary} />
    </View>
  );
}

/** Soft filled pill/chip. `selected` fills coral; otherwise neutral. */
export function Chip({ label, selected = false }: { label: string; selected?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surface }]}>
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.foreground }]}>{label}</Text>
    </View>
  );
}

/** Full-width soft (tinted) button — Sign Out, Show on Calendar, etc. */
export function SoftButton({
  icon, label, tone = 'primary', onPress,
}: {
  icon?: keyof typeof MaterialIcons.glyphMap; label: string;
  tone?: 'primary' | 'danger'; onPress?: () => void;
}) {
  const colors = useColors();
  const fg = tone === 'danger' ? colors.error : colors.primary;
  const bg = fg + '1F';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.softBtn, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }]}>
      {icon ? <MaterialIcons name={icon} size={20} color={fg} /> : null}
      <Text style={[styles.softBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  divider: { height: StyleSheet.hairlineWidth * 2 },
  section: { paddingHorizontal: GUTTER, paddingVertical: 22 },
  statRow: { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 12, paddingVertical: 22 },
  statCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statSep: { position: 'absolute', left: 0, top: 4, bottom: 4, width: StyleSheet.hairlineWidth * 2 },
  statValue: { fontSize: 30, fontWeight: '800' },
  statCaption: { fontSize: 12, fontWeight: '600', marginTop: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 17, fontWeight: '700' },
  rowSub: { fontSize: 14, marginTop: 2 },
  chip: { borderRadius: 100, paddingHorizontal: 16, paddingVertical: 9 },
  chipText: { fontSize: 14, fontWeight: '600' },
  softBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 16 },
  softBtnText: { fontSize: 16, fontWeight: '700' },
});
