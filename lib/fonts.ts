/**
 * Font assets loaded by expo-font's `useFonts` in app/_layout.tsx.
 * General Sans = body / everything. Clash Display = logo + big headers.
 */
export const FONT_ASSETS = {
  'GeneralSans-Light': require('../assets/fonts/GeneralSans-Light.otf'),
  'GeneralSans-Regular': require('../assets/fonts/GeneralSans-Regular.otf'),
  'GeneralSans-Medium': require('../assets/fonts/GeneralSans-Medium.otf'),
  'GeneralSans-Semibold': require('../assets/fonts/GeneralSans-Semibold.otf'),
  'GeneralSans-Bold': require('../assets/fonts/GeneralSans-Bold.otf'),
  'ClashDisplay-Medium': require('../assets/fonts/ClashDisplay-Medium.otf'),
  'ClashDisplay-Semibold': require('../assets/fonts/ClashDisplay-Semibold.otf'),
  'ClashDisplay-Bold': require('../assets/fonts/ClashDisplay-Bold.otf'),
} as const;

/** Explicit families for setting a font directly in a style. */
export const fonts = {
  display: 'ClashDisplay-Semibold',
  displayBold: 'ClashDisplay-Bold',
  displayMedium: 'ClashDisplay-Medium',
  bodyRegular: 'GeneralSans-Regular',
  bodyMedium: 'GeneralSans-Medium',
  bodySemibold: 'GeneralSans-Semibold',
  bodyBold: 'GeneralSans-Bold',
};

/**
 * Map a fontWeight to the correct font file.
 * 800/900 -> Clash Display (big headers); everything else -> General Sans.
 */
export function familyForWeight(weight?: string | number): string {
  const w = String(weight ?? '400');
  if (w === '800' || w === '900') return 'ClashDisplay-Semibold';
  switch (w) {
    case '100':
    case '200':
    case '300':
      return 'GeneralSans-Light';
    case '500':
      return 'GeneralSans-Medium';
    case '600':
      return 'GeneralSans-Semibold';
    case '700':
    case 'bold':
      return 'GeneralSans-Bold';
    default:
      return 'GeneralSans-Regular';
  }
}
