/**
 * WEB build of observability — a no-op with the same public API as observability.ts.
 *
 * Why a separate file: on web, `@sentry/react-native` resolves to `@sentry/browser`, whose
 * webWorker integration uses `import.meta` — a *parse-time* syntax error in the classic-script
 * web bundle, which crashes the whole app before any try/catch can run. Telemetry is optional,
 * so the web variant simply skips Sentry. Metro auto-picks this `.web.ts` over the `.ts` on web.
 */

export function initObservability(): void {}

export function wrapRoot<T>(component: T): T {
  return component;
}

export function reportError(_e: unknown, _extra?: Record<string, unknown>): void {}

export function getObservabilityStatus() {
  return {
    sdkPresent: false,
    dsnSet: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
    initialized: false,
    dev: __DEV__,
  };
}

export function reportWarning(_message: string, _extra?: Record<string, unknown>): void {}
