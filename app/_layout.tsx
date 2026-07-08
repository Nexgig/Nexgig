import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, LogBox } from '@/lib/rn';
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider, useThemeContext, isThemeHydrated, whenThemeReady } from "@/lib/theme-provider";
import { SchemeColors } from "@/constants/theme";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { supabase } from "@/lib/supabase";
import { useAuthStore, resetAllStores } from "@/lib/store";
import { registerForPushNotifications } from "@/lib/notifications-push";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { FONT_ASSETS } from "@/lib/fonts";

// Silence React Native's internal SafeAreaView deprecation warning.
// It originates from RN's own Button/InputAccessoryView components, not our code.
LogBox.ignoreLogs([/SafeAreaView has been deprecated/]);

// Keep the native splash on screen until our custom fonts have loaded so text
// doesn't flash in the system font first.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Hide the splash instantly (no cross-fade). The fade composited the splash's
// light backing over the already-painted app for ~150ms, which in dark mode
// looked like the whole screen briefly washing white before snapping to normal.
// A hard cut reveals the already-dark app cleanly.
SplashScreen.setOptions({ fade: false });

// Minimum time (ms) to keep the splash/logo on screen, even if fonts + data are
// ready sooner — so the logo registers for a beat instead of flashing past.
const MIN_SPLASH_MS = 250;
const APP_START = Date.now();

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

// Drive the OS status bar (clock, signal, battery) from the APP's active theme
// rather than the device scheme. `style="auto"` keys off the device's color
// scheme, so a phone in dark mode would paint white icons on our white (light)
// background and make them invisible. Light theme -> dark icons; dark -> light.
function ThemedStatusBar() {
  const { colorScheme } = useThemeContext();
  return <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />;
}

// Renders the root navigator with a themed scene background (so no default-white
// navigator scene flashes in dark mode during the launch transition) and a soft
// fade — instead of a slide-from-right — when entering the manager/artist groups
// on cold start or sign-in.
function ThemedAppStack() {
  const { colorScheme } = useThemeContext();
  const bg = SchemeColors[colorScheme].background;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="(manager)" options={{ animation: "fade" }} />
      <Stack.Screen name="(artist)" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  useEffect(() => {
    initManusRuntime();
  }, []);

  // Wait for the persisted theme to hydrate before hiding the splash, so the
  // first visible frame is already in the correct scheme (no light flash in dark
  // mode). Starts true if the theme settled before this component mounted.
  const [themeReady, setThemeReady] = useState(isThemeHydrated());
  useEffect(() => {
    whenThemeReady(() => setThemeReady(true));
  }, []);

  // Hide the splash once fonts are ready AND the theme has hydrated, respecting
  // the MIN_SPLASH_MS floor so the logo shows for a brief, deliberate beat.
  useEffect(() => {
    if ((fontsLoaded || fontError) && themeReady) {
      const elapsed = Date.now() - APP_START;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, wait);
      return () => clearTimeout(t);
    }
  }, [fontsLoaded, fontError, themeReady]);

  // Clear stale/invalid session on app launch
  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      if (error) supabase.auth.signOut();
    });
  }, []);

  // Listen for auth state changes — handle invalid refresh token
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        resetAllStores();
        signOut();
        router.replace('/(auth)/welcome' as any);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Register this device for push notifications whenever a user is signed in.
  useEffect(() => {
    if (currentUser?.id) {
      registerForPushNotifications(currentUser.id);
    }
  }, [currentUser?.id]);

  // Route a tapped push notification to the right screen from its data payload.
  // The create-notification Edge Function sends { type, related_id, related_type }.
  // Mirrors the in-app notification tap routing; falls back to the list.
  const routeFromPush = useCallback((data: Record<string, any> | null | undefined) => {
    const accountType = useAuthStore.getState().currentUser?.accountType;
    if (!accountType || !data) return;
    const base = accountType === 'manager' ? '/(manager)' : '/(artist)';
    const type = data.type as string | undefined;
    const relatedId = data.related_id as string | undefined;
    const relatedType = data.related_type as string | undefined;

    if (relatedType === 'booking' && relatedId) {
      router.push(`${base}/booking-detail?id=${relatedId}` as any);
      return;
    }
    if (accountType === 'artist' && type === 'venue_assigned') {
      router.push(`${base}/my-venues${relatedId ? `?highlightVenueId=${relatedId}` : ''}` as any);
      return;
    }
    if (accountType === 'artist' && (type === 'lineup_added' || type === 'lineup_removed' || type === 'venue_removed')) {
      router.push(`${base}/my-venues` as any);
      return;
    }
    router.push(`${base}/notifications` as any);
  }, [router]);

  // Holds a tap that arrived before the user was hydrated (cold start, or a tap
  // during the auth-store rehydrate), flushed by the effect below once signed in.
  const pendingPushData = useRef<Record<string, any> | null>(null);

  // Cold start: if a tapped push launched the app, capture it for the flush effect.
  useEffect(() => {
    let mounted = true;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (mounted && response) {
        pendingPushData.current = response.notification.request.content.data as Record<string, any>;
      }
    });
    return () => { mounted = false; };
  }, []);

  // Warm taps (app already open): route now if the user is ready, else queue it.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (useAuthStore.getState().currentUser?.accountType) {
        routeFromPush(data);
      } else {
        pendingPushData.current = data ?? null;
      }
    });
    return () => sub.remove();
  }, [routeFromPush]);

  // Flush a queued tap once the user is hydrated. Small defer so the navigator and
  // initial (auth-gate) route are mounted before we push on top of them.
  useEffect(() => {
    if (currentUser?.id && pendingPushData.current) {
      const data = pendingPushData.current;
      pendingPushData.current = null;
      const t = setTimeout(() => routeFromPush(data), 400);
      return () => clearTimeout(t);
    }
  }, [currentUser?.id, routeFromPush]);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Ensure minimum padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  // Don't render the app tree until fonts are ready (splash stays up).
  if (!fontsLoaded && !fontError) {
    return null;
  }

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemedAppStack />
        <ThemedStatusBar />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}