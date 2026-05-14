import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';

interface EmptyStateProps {
  icon?: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon = 'inbox', title, subtitle }: EmptyStateProps) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <MaterialIcons name={icon as any} size={48} color={colors.muted} />
      <Text className="text-lg font-semibold text-foreground mt-4 text-center">{title}</Text>
      {subtitle && (
        <Text className="text-sm text-muted mt-2 text-center leading-5">{subtitle}</Text>
      )}
    </View>
  );
}
