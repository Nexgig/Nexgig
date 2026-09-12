const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = withNativeWind(getDefaultConfig(__dirname), {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});

// Web build: stub out @sentry/* entirely. On web, @sentry/react-native resolves to
// @sentry/browser, whose webWorker integration uses `import.meta` — a parse-time syntax
// error in the classic-script web bundle that blanks the whole app. Sentry is optional
// telemetry, so on web it resolves to an empty module. (Native builds are untouched.)
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName.startsWith("@sentry/")) {
    return { type: "empty" };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
