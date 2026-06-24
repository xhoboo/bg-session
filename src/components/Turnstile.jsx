import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile CAPTCHA widget. Renders the bot-check that Supabase Auth
// verifies server-side (Attack Protection → CAPTCHA, provider "Turnstile").
//
// The site key is public and read from VITE_TURNSTILE_SITE_KEY. When it's unset
// — local dev without a key — the widget renders nothing and `captchaEnabled` is
// false, so the auth forms stay usable. Supabase's CAPTCHA toggle must only be
// turned on once a real key is configured here, or every sign-in/up would break.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Whether a CAPTCHA is configured. Forms use this to decide if a token is
// required before submitting.
export const captchaEnabled = Boolean(SITE_KEY)

// Load the Turnstile script once, shared across every widget instance.
let scriptPromise = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

// Props:
//   onVerify(token) — fires when a fresh token is solved
//   onExpire()      — token aged out (~5 min); clear it and wait for a new one
//   onError()       — script failed to load or the challenge errored
// Imperative handle: reset() — discard the current token and re-run the
// challenge (Turnstile tokens are single-use, so call this after each submit).
const Turnstile = forwardRef(function Turnstile({ onVerify, onExpire, onError }, ref) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }), [])

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'auto', // follows the page's light/dark theme
          callback: (token) => onVerify?.(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onError?.(),
        })
      })
      .catch(() => onError?.())
    return () => {
      cancelled = true
      if (widgetIdRef.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null
      }
    }
    // Render once on mount; callbacks set parent state and are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} className="turnstile" style={{ marginBottom: 12 }} />
})

export default Turnstile
