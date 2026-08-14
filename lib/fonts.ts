/**
 * Font assets loaded by expo-font's `useFonts` in app/_layout.tsx.
 * General Sans = body + all headings/titles. Clash Display = the "Nexgig." logo, the
 * status dots (its round period glyph), and the generated invoice-document branding only.
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
  // Bricolage Grotesque (SIL OFL) — the app's HEADER font (tab/screen titles + section headers).
  'BricolageGrotesque-SemiBold': require('../assets/fonts/BricolageGrotesque-SemiBold.otf'),
  'BricolageGrotesque-Bold': require('../assets/fonts/BricolageGrotesque-Bold.otf'),
} as const;

/** Explicit families for setting a font directly in a style. */
export const fonts = {
  display: 'ClashDisplay-Semibold',
  displayBold: 'ClashDisplay-Bold',
  displayMedium: 'ClashDisplay-Medium',
  // Header font — Bricolage Grotesque. Used by the tab/screen titles + section headers.
  header: 'BricolageGrotesque-Bold',
  headerSemibold: 'BricolageGrotesque-SemiBold',
  bodyRegular: 'GeneralSans-Regular',
  bodyMedium: 'GeneralSans-Medium',
  bodySemibold: 'GeneralSans-Semibold',
  bodyBold: 'GeneralSans-Bold',
};

/**
 * Map a fontWeight to the correct font file. ALL weights resolve to General Sans now —
 * 800/900 used to route to Clash Display, but headings/titles are General Sans app-wide.
 * Clash Display is only ever applied by naming it explicitly (logo, status dots, invoices).
 */
export function familyForWeight(weight?: string | number): string {
  const w = String(weight ?? '400');
  if (w === '800' || w === '900') return 'GeneralSans-Bold';
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
