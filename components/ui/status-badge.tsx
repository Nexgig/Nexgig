import { Text, View } from '@/lib/rn';
import { StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAuthStore } from '@/lib/store';
import type { BookingStatus, LineupStatus, InviteStatus } from '@/lib/types';

type BadgeVariant = BookingStatus | LineupStatus | InviteStatus | 'conflict' | 'available' | 'hidden' | 'active' | 'draft';

/** Which theme token drives each status. `completed` is the one fixed blue (per HANDOFF). */
type Tone = 'success' | 'warning' | 'error' | 'muted' | 'completed';

const BADGE_MAP: Record<string, { tone: Tone; label: string }> = {
  draft:             { tone: 'muted',     label: 'Draft' },
  requested:         { tone: 'warning',   label: 'Pending' },
  confirmed:         { tone: 'success',   label: 'Booked' },
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

// Booking-status tones come from STATUS_COLORS so this pill and the DateBadge can never
// disagree — they label the same thing. `success`/`error` stay on theme tokens: those
// tones also cover non-booking states (active, accepted, available).
import { STATUS_COLORS } from './date-badge';

interface StatusBadgeProps {
  status: BadgeVariant;
  label?: string;
}

/**
 * Card-free status pill: tinted background + coloured text.
 *
 * No leading dot — the pill is already colour-coded, so the dot repeated the same
 * information in the same colour right next to the word that says it.
 */
// Perspective-aware label: a `requested`/`past_confirmation` booking is one the MANAGER SENT,
// so managers read it as "Sent"; the ARTIST received it and hasn't answered, so they read
// "Pending". Same status, different word depending on who's looking.
const PENDING_STATUSES = new Set<string>(['requested', 'past_confirmation', 'pending']);

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = useColors();
  const isManager = useAuthStore((s) => s.currentUser?.accountType === 'manager');
  const entry = BADGE_MAP[status] ?? { tone: 'muted' as Tone, label: String(status) };
  const autoLabel = isManager && PENDING_STATUSES.has(status) ? 'Sent' : entry.label;

  const color =
    entry.tone === 'success' ? colors.success :
    entry.tone === 'warning' ? STATUS_COLORS.pending :
    entry.tone === 'error' ? colors.error :
    entry.tone === 'completed' ? STATUS_COLORS.completed :
    colors.muted;

  return (
    <View style={[styles.pill, { backgroundColor: color + '1F' }]}>
      <Text style={[styles.text, { color }]}>{label ?? autoLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
});
