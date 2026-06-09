import { Image, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { cn } from '@/lib/utils';

interface AvatarImageProps {
  uri?: string;
  name?: string;
  size?: number;
  className?: string;
}

export function AvatarImage({ uri, size = 40, className }: AvatarImageProps) {
  const colors = useColors();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className={className}
      />
    );
  }

  // No photo → fall back to the shared person icon (consistent everywhere)
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className={cn('items-center justify-center', className)}
    >
      <MaterialIcons name="person" size={size * 0.55} color={colors.muted} />
    </View>
  );
}
