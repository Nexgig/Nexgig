/**
 * Thin observability wrapper around Sentry.
 *
 * Sentry is an OPTIONAL native dependency. Everything here is a safe no-op until:
 *   1. the package is installed  (`npx expo install @sentry/react-native`), AND
 *   2. a DSN is provided          (`EXPO_PUBLIC_SENTRY_DSN` in the env).
 *
 * All app code imports from THIS module, never from `@sentry/react-native` directly,
 * so the rest of the codebase compiles and runs whether or not Sentry is present.
 *
 * `reportWarning` is the "this shouldn't happen, tell me about it" signal — used at
 * silent-failure points (a DB write that touches 0 rows, a booking that wasn't in the
 * store, etc.) that never throw and so would otherwise be invisible.
 */

type SentryLike = {
  init?: (opts: Record<string, unknown>) => void;
  wrap?: <T>(component: T) => T;
  captureException?: (e: unknown, ctx?: Record<string, unknown>) => void;
  captureMessage?: (message: string, ctx?: Record<string, unknown>) => void;
};

let sentry: SentryLike = {};
try {
  // @ts-ignore — optional dep; resolved only once `@sentry/react-native` is installed.
  sentry = require('@sentry/react-native');
} catch {
  sentry = {};
}

let started = false;

/** Initialise Sentry from env. No DSN, or dev, or package missing → no-op. */
export function initObservability(): void {
  if (started) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || !sentry.init) return;
  try {
    sentry.init({
      dsn,
      // Only send from real builds — never dev.
      enabled: !__DEV__,
      tracesSampleRate: 0.2,
      // Never attach personal data to events.
      sendDefaultPii: false,
    });
    started = true;
  } catch {
    // never let telemetry setup break the app
  }
}

/** Wrap the root component with Sentry's error boundary. Passthrough when absent. */
export function wrapRoot<T>(component: T): T {
  try {
    return sentry.wrap ? sentry.wrap(component) : component;
  } catch {
    return component;
  }
}

/** A real error / caught exception. "Something broke." */
export function reportError(e: unknown, extra?: Record<string, unknown>): void {
  try {
    sentry.captureException?.(e, extra ? { extra } : undefined);
  } catch {
    // swallow — reporting must never throw
  }
}

/** Nothing threw, but this state shouldn't happen. "Tell me it occurred." */
export function reportWarning(message: string, extra?: Record<string, unknown>): void {
  try {
    sentry.captureMessage?.(message, { level: 'warning', extra });
  } catch {
    // swallow
  }
}
