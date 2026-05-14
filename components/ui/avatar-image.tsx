import { Image, View, Text } from 'react-native';
import { cn } from '@/lib/utils';

interface AvatarImageProps {
  uri?: string;
  name?: string;
  size?: number;
  className?: string;
}

export function AvatarImage({ uri, name, size = 40, className }: AvatarImageProps) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className={className}
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={cn('bg-accent items-center justify-center', className)}
    >
      <Text style={{ fontSize: size * 0.35 }} className="text-white font-bold">
        {initials}
      </Text>
    </View>
  );
}
