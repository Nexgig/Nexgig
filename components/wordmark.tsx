import { Text, StyleSheet, type TextStyle } from '@/lib/rn';
import { useColors } from '@/hooks/use-colors';
import { fonts } from '@/lib/fonts';

/**
 * The Nexgig wordmark — "Nexgig" in Clash Display with a coral period.
 * Used in place of the old X logo image in the dashboard headers.
 */
export function Wordmark({ size = 26, style }: { size?: number; style?: TextStyle }) {
  const colors = useColors();
  return (
    <Text
      allowFontScaling={false}
      style={[styles.text, { fontSize: size, color: colors.foreground }, style]}
    >
      Nexgig<Text style={{ color: colors.primary, fontFamily: fonts.displayBold }}>.</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.displayBold, letterSpacing: -0.5 },
});
