import { Image, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';
import { cn } from '@/lib/utils';

// Illustrated fallback avatar for managers with no uploaded photo.
const MANAGER_AVATAR = require('@/assets/images/manager-avatar.png');

interface AvatarImageProps {
  uri?: string;
  name?: string;
  size?: number;
  className?: string;
  /** 'manager' shows the illustrated manager avatar when there's no photo;
   *  anything else (default) shows the generic person icon. */
  variant?: 'manager' | 'artist';
}

export function AvatarImage({ uri, size = 40, className, variant }: AvatarImageProps) {
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

  // No photo, manager → illustrated manager avatar.
  if (variant === 'manager') {
    return (
      <Image
        source={MANAGER_AVATAR}
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
