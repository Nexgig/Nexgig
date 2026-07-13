import { Text, View } from '@/lib/rn';
import { StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { BookingStatus, LineupStatus, InviteStatus } from '@/lib/types';

type BadgeVariant = BookingStatus | LineupStatus | InviteStatus | 'conflict' | 'available' | 'hidden' | 'active' | 'draft';

/** Which theme token drives each status. `completed` is the one fixed blue (per HANDOFF). */
type Tone = 'success' | 'warning' | 'error' | 'muted' | 'completed';

const BADGE_MAP: Record<string, { tone: Tone; label: string }> = {
  draft:             { tone: 'muted',     label: 'Draft' },
  requested:         { tone: 'warning',   label: 'Pending' },
  confirmed:         { tone: 'success',   label: 'Confirmed' },
  completed:         { tone: 'completed', label: 'Completed' },
  past_confirmation: { tone: 'warning',   label: 'Pending' },
  declined:          { tone: 'error',     label: 'Declined' },
  cancelled:         { tone: 'error',     label: 'Cancelled' },
  pending:           { tone: 'warning',   label: 'Pending' },
  active:            { tone: 'success',   label: 'Active' },
  removed:           { tone: 'muted',     label: 'Removed' },
  accepted:          { tone: 'success',   label: 'Accepted' },
  expired:           { tone: 'muted',     label: 'Expired' },
  conflict:          { tone: 'error',     label: 'Conflict' },
  available:         { tone: 'success',   label: 'Available' },
  hidden:            { tone: 'muted',     label: 'Hidden' },
};

const COMPLETED_BLUE = '#2563EB';

interface StatusBadgeProps {
  status: BadgeVariant;
  label?: string;
  /** Hide the small leading dot (default: shown). */
  dot?: boolean;
}

/**
 * Card-free status pill: tinted background + colored text + a small leading dot.
 * (Was a solid-filled block with black text.)
 */
export function StatusBadge({ status, label, dot = true }: StatusBadgeProps) {
  const colors = useColors();
  const entry = BADGE_MAP[status] ?? { tone: 'muted' as Tone, label: String(status) };

  const color =
    entry.tone === 'success' ? colors.success :
    entry.tone === 'warning' ? colors.warning :
    entry.tone === 'error' ? colors.error :
    entry.tone === 'completed' ? COMPLETED_BLUE :
    colors.muted;

  return (
    <View style={[styles.pill, { backgroundColor: color + '1F' }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.text, { color }]}>{label ?? entry.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
