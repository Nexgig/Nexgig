import { Text, View } from '@/lib/rn';
import { cn } from '@/lib/utils';
import type { BookingStatus, LineupStatus, InviteStatus } from '@/lib/types';

type BadgeVariant = BookingStatus | LineupStatus | InviteStatus | 'conflict' | 'available' | 'hidden' | 'active' | 'draft';

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:            { bg: 'bg-[#8E8E93]',  text: 'text-[#000000]',    label: 'Draft' },
  requested:        { bg: 'bg-warning',     text: 'text-[#000000]',    label: 'Pending' },
  confirmed:        { bg: 'bg-success',     text: 'text-[#000000]',    label: 'Confirmed' },
  completed:        { bg: 'bg-[#2563EB]',  text: 'text-[#FFFFFF]',    label: 'Completed' },
  past_confirmation:{ bg: 'bg-warning',     text: 'text-[#000000]',    label: 'Pending' },
  declined:         { bg: 'bg-error',       text: 'text-[#000000]',    label: 'Declined' },
  cancelled:        { bg: 'bg-error',       text: 'text-[#000000]',    label: 'Cancelled' },
  pending:          { bg: 'bg-warning',     text: 'text-[#000000]',    label: 'Pending' },
  active:           { bg: 'bg-success',     text: 'text-[#000000]',    label: 'Active' },
  removed:          { bg: 'bg-muted',       text: 'text-[#000000]',    label: 'Removed' },
  accepted:         { bg: 'bg-success',     text: 'text-[#000000]',    label: 'Accepted' },
  expired:          { bg: 'bg-muted',       text: 'text-[#000000]',    label: 'Expired' },
  conflict:         { bg: 'bg-error',       text: 'text-[#000000]',    label: 'Conflict' },
  available:        { bg: 'bg-success',     text: 'text-[#000000]',    label: 'Available' },
  hidden:           { bg: 'bg-muted',       text: 'text-[#000000]',    label: 'Hidden' },
};

interface StatusBadgeProps {
  status: BadgeVariant;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, label, size = 'sm', className }: StatusBadgeProps) {
  const style = BADGE_STYLES[status] ?? { bg: 'bg-muted', text: 'text-[#000000]', label: status };
  const displayLabel = label ?? style.label;
  return (
    <View className={cn(
      'rounded-full items-center justify-center',
      style.bg,
      size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1',
      className
    )}>
      <Text className={cn(
        'font-semibold',
        style.text,
        size === 'sm' ? 'text-xs' : 'text-sm'
      )}>
        {displayLabel}
      </Text>
    </View>
  );
}
