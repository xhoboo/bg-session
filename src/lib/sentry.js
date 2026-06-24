// Optional error monitoring. Sentry is loaded only when VITE_SENTRY_DSN is set,
// via a dynamic import — so when it's unconfigured (local dev, or before a DSN
// is wired in Vercel) nothing is downloaded and there's zero runtime cost. Once
// initialised, Sentry's default integrations also catch unhandled errors and
// promise rejections, not just the ones our React ErrorBoundary forwards.

let sentry = null

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Errors only by default — no performance tracing or session replay, to
      // keep this light and avoid extra quota/PII. Bump these intentionally if
      // you later want tracing.
      tracesSampleRate: 0,
    })
    sentry = Sentry
  } catch (e) {
    // Never let monitoring setup break the app.
    console.warn('[sentry] init failed:', e?.message)
  }
}

// Forward an error to Sentry if it's initialised; a no-op otherwise.
export function reportError(error, context) {
  if (!sentry) return
  sentry.captureException(error, context ? { extra: context } : undefined)
}
