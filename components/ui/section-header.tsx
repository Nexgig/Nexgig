import { View, Text, Pressable } from '@/lib/rn';
import { fonts } from '@/lib/fonts';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional element rendered immediately to the right of the title (e.g. a filter icon). */
  leftAccessory?: ReactNode;
  /** Optional element pinned to the far right of the header (e.g. a filter button). */
  rightAccessory?: ReactNode;
  /** Override the title font size (default is text-lg ≈ 18). */
  titleSize?: number;
}

export function SectionHeader({ title, actionLabel, onAction, leftAccessory, rightAccessory, titleSize }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 20 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text className="text-lg text-foreground" style={[{ fontFamily: fonts.headerSemibold }, titleSize ? { fontSize: titleSize } : null]}>{title}</Text>
        {leftAccessory}
      </View>
      {rightAccessory ? rightAccessory : (actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text className="text-sm text-foreground font-medium">{actionLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}
