import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, LogBox } from '@/lib/rn';
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider, useThemeContext } from "@/lib/theme-provider";
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

  // Wait for the persisted auth store to hydrate before hiding the splash, so the
  // dispatcher can route straight to the correct screen (dashboard vs. welcome)
  // and the splash lifts directly onto it — no intermediate tab screen, no slide.
  const [authHydrated, setAuthHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  useEffect(() => {
    if (authHydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setAuthHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setAuthHydrated(true);
    return unsub;
  }, [authHydrated]);

  // Hide the splash once fonts are ready AND auth has hydrated (or fonts failed —
  // don't trap the user). Wait two frames so the dispatcher's Redirect lands AND
  // the destination screen completes its first layout pass behind the splash —
  // otherwise its content visibly settles (small jump) the moment the splash lifts.
  useEffect(() => {
    if ((fontsLoaded || fontError) && authHydrated) {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => { SplashScreen.hideAsync().catch(() => {}); });
      });
      return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
    }
  }, [fontsLoaded, fontError, authHydrated]);

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
        <Stack screenOptions={{ headerShown: false, animation: "none" }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(manager)" />
          <Stack.Screen name="(artist)" />
        </Stack>
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