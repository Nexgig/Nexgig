import { View, Text, Pressable } from 'react-native';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text className="text-sm text-foreground font-medium">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
