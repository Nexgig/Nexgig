import { View, Text, Pressable } from '@/lib/rn';
import { fonts } from '@/lib/fonts';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional element rendered immediately to the right of the title (e.g. a filter icon). */
  leftAccessory?: ReactNode;
}

export function SectionHeader({ title, actionLabel, onAction, leftAccessory }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 20 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text className="text-lg text-foreground" style={{ fontFamily: fonts.display }}>{title}</Text>
        {leftAccessory}
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text className="text-sm text-foreground font-medium">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
