// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.nexgig.app";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Nexgig",
  appSlug: "nexgig",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663504336810/FwLDRsboLOFZEqDA.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/eae9c0e4-5f95-4c8b-ba5f-09303b81ecbe",
  },
  orientation: "portrait",
  icon: "./assets/images/app-icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    // iPhone only. The layouts (calendar, sheets, tab bars) are built for a narrow
    // viewport; declaring iPad support would make Apple review it on a 12.9" screen
    // and require a separate set of iPad screenshots.
    supportsTablet: false,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E2674A",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    googleServicesFile: "./google-services.json",
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-apple-authentication",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: "com.googleusercontent.apps.1090523281211-facnl2rejtk7oivo71nir9h70jt3o2ot",
      },
    ],
    [
      "expo-notifications",
      {
        color: "#E2674A",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "Allow $(PRODUCT_NAME) to access your calendar to export your gigs."
      }
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#E2674A",
        dark: {
          backgroundColor: "#E2674A",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
        ios: {
          // Firebase/Google pods (pulled in via google-services.json +
          // google-signin) are Swift static-lib pods whose deps don't define
          // modules; modular headers let them be imported when built static.
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "RecaptchaInterop", modular_headers: true },
            { name: "AppCheckCore", modular_headers: true },
          ],
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    // reactCompiler disabled: its build-time auto-memoization was preventing the
    // theme provider's state change from re-rendering consumers on a live switch
    // (System/Light/Dark only applied after an app restart).
    reactCompiler: false,
  },
  extra: {
    eas: {
      projectId: "eae9c0e4-5f95-4c8b-ba5f-09303b81ecbe",
    },
  },
};

export default config;
