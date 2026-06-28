import { View } from '@/lib/rn';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/use-colors';

/**
 * Monochrome "verified" badge.
 *
 * Renders a filled seal in the theme's foreground colour with the check
 * showing through in the background colour. In light mode this reads as a
 * black seal with a white check; in dark mode it inverts automatically
 * (light seal, dark check), so the badge stays legible on any surface
 * without being managed per-screen.
 */
export function VerifiedBadge({ size = 16 }: { size?: number }) {
  const colors = useColors();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Fills the seal's cut-out check from behind with the contrast colour */}
      <MaterialIcons
        name="circle"
        size={size * 0.55}
        color={colors.background}
        style={{ position: 'absolute' }}
      />
      <MaterialIcons name="verified" size={size} color={colors.foreground} />
    </View>
  );
}
