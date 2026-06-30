import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

const STORAGE_KEY_APPEARANCE = 'nexgig:appearance';

export type AppearanceMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: ColorScheme;
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => void;
  /** @deprecated use setAppearance instead; kept for backward compatibility */
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The OS theme, kept in state and updated via an Appearance listener.
  // We use Appearance.getColorScheme()/addChangeListener directly rather than RN's
  // useColorScheme() hook, because that hook can return a stale value and fails to
  // re-render consumers reliably when switching to 'system' — which forced an app
  // restart to see the change. NOTE: we deliberately never call
  // Appearance.setColorScheme(), since that would override what getColorScheme()
  // reports and break 'system' following the OS.
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(
    () => (Appearance.getColorScheme() ?? "light")
  );
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme: next }) => {
      setSystemScheme(next ?? "light");
    });
    // Re-sync once on mount in case the value settled after first render.
    setSystemScheme(Appearance.getColorScheme() ?? "light");
    return () => sub.remove();
  }, []);

  // Source of truth = the user's chosen MODE ('system' | 'light' | 'dark').
  const [appearance, setAppearanceState] = useState<AppearanceMode>('system');
  // The effective scheme is derived: 'system' follows the live OS theme.
  const colorScheme: ColorScheme = appearance === 'system' ? systemScheme : appearance;

  // Apply the resolved scheme to NativeWind + the web DOM. We intentionally skip
  // native Appearance.setColorScheme so the OS theme stays readable for 'system'.
  const applyScheme = useCallback((scheme: ColorScheme) => {
    nativewindColorScheme.set(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
    AsyncStorage.setItem(STORAGE_KEY_APPEARANCE, mode);
  }, []);

  // Backward-compat shim: an explicit scheme is just a light/dark mode choice.
  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setAppearance(scheme);
  }, [setAppearance]);

  // Load persisted appearance MODE on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_APPEARANCE).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setAppearanceState(saved);
      }
    });
  }, []);

  // Keep NativeWind / DOM in sync whenever the resolved scheme changes
  // (covers mode changes AND live OS theme changes while in 'system').
  useEffect(() => {
    applyScheme(colorScheme);
  }, [colorScheme, applyScheme]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      appearance,
      setAppearance,
      setColorScheme,
    }),
    [colorScheme, appearance, setAppearance, setColorScheme],
  );
  return (
    <ThemeContext.Provider value={value}>
      {/* key={colorScheme} forces a one-time remount of the whole tree when the
          resolved scheme flips. This is required because screen backgrounds and
          text use NativeWind classes (bg-background, text-foreground, ...) which
          resolve from the CSS vars below; NativeWind doesn't reliably re-flow
          already-mounted className colors on a live scheme switch, so without
          the remount a theme change only appeared after an app restart. */}
      <View key={colorScheme} style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
