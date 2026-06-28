import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { familyForWeight } from '@/lib/fonts';

/**
 * Drop-in replacement for react-native's <Text>. Applies the correct
 * General Sans weight (or Clash Display for 800/900) based on the style's
 * fontWeight, unless the style already names a fontFamily (e.g. an explicit
 * Clash header or the Nexgig wordmark), in which case it's passed through.
 *
 * Used app-wide via the @/lib/rn re-export shim, because on RN 0.81 the older
 * global font-patching techniques no longer work.
 */
export function Text({ style, ...rest }: TextProps) {
  const flat: any = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) {
    return <RNText style={style} {...rest} />;
  }
  const fontFamily = familyForWeight(flat.fontWeight);
  // Normalize weight so the platform doesn't faux-bold the already-weighted face.
  return <RNText {...rest} style={[style, { fontFamily, fontWeight: 'normal' }]} />;
}
