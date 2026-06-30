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

// Resolve the OS theme at call time (no React hook caching in between).
function readSystemScheme(): ColorScheme {
  return (Appearance.getColorScheme() ?? "light") as ColorScheme;
}

// Apply the resolved scheme to NativeWind + the web DOM. Defined at module scope
// so it has no component-closure deps the compiler could stale-capture. We never
// call Appearance.setColorScheme(), since that overrides getColorScheme() and
// would break 'system' following the OS.
function applyScheme(scheme: ColorScheme) {
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
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The user's chosen MODE ('system' | 'light' | 'dark').
  const [appearance, setAppearanceState] = useState<AppearanceMode>('system');
  // The RESOLVED scheme is held in real state (not derived), and we drive every
  // change through an explicit setState. A derived const can be elided by the
  // React Compiler; an explicit setColorSchemeState call cannot.
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => readSystemScheme());

  // Central updater: given a mode, compute + commit the resolved scheme.
  const applyMode = useCallback((mode: AppearanceMode) => {
    const resolved: ColorScheme = mode === 'system' ? readSystemScheme() : mode;
    setColorSchemeState(resolved);
    applyScheme(resolved);
  }, []);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
    applyMode(mode);
    AsyncStorage.setItem(STORAGE_KEY_APPEARANCE, mode);
  }, [applyMode]);

  // Backward-compat shim: an explicit scheme is just a light/dark mode choice.
  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setAppearance(scheme);
  }, [setAppearance]);

  // Follow live OS theme changes while in 'system' mode.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (appearance === 'system') applyMode('system');
    });
    return () => sub.remove();
  }, [appearance, applyMode]);

  // Load persisted appearance MODE on mount, then resolve + apply it.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_APPEARANCE).then((saved) => {
      const mode: AppearanceMode =
        saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
      setAppearanceState(mode);
      applyMode(mode);
    });
  }, [applyMode]);

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
