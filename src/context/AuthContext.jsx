import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load the current session on mount and subscribe to auth changes.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      // On refresh a session is restored here. Mark the profile as not-yet-
      // loaded so route gates wait for it, instead of briefly seeing a stale
      // "loaded" flag with a null profile and bouncing the user to onboarding
      // (and from there to the homepage).
      if (data.session?.user) setProfileLoaded(false)
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const loadProfile = useCallback(async (uid) => {
    setProfileLoaded(false)
    // Public profile + the user's own private fields (real name, gender, photo).
    const [{ data: pub }, { data: priv }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, nickname, domicile, favorite_games, owned_games, onboarded, last_seen_at')
        .eq('id', uid)
        .maybeSingle(),
      supabase
        .from('profile_private')
        .select('real_name, gender, photo_url')
        .eq('id', uid)
        .maybeSingle(),
    ])
    // We touch last_seen on load, so for your own profile you're online "now" —
    // stamp it locally too, sidestepping a read/write race on first load.
    setProfile(pub ? { ...pub, ...(priv ?? {}), last_seen_at: new Date().toISOString() } : null)
    setProfileLoaded(true)
  }, [])

  // Keep the user's profile row in sync with the active session.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) {
      setProfile(null)
      setProfileLoaded(true)
      return
    }
    loadProfile(session.user.id)
  }, [session?.user?.id, loadProfile])

  // Keep last_seen_at tied to real activity, so members show an accurate
  // "Online now" / "Last seen Xm ago". A single stamp on load goes stale while
  // the app stays open — making an active user look offline to everyone else,
  // and freezing your own profile at the load time. So we re-stamp on any user
  // interaction (click / keypress / scroll / navigation) and when the tab
  // regains focus, throttled to at most once a minute and only while the tab is
  // visible. We update the local profile too, so your own profile reads
  // "Online now" instead of a frozen load-time value.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) return
    let lastPing = 0
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastPing < 60_000) return
      lastPing = now
      supabase.rpc('touch_last_seen') // server sets the clock; fire-and-forget
      setProfile((p) => (p ? { ...p, last_seen_at: new Date().toISOString() } : p))
    }
    ping() // stamp immediately on login / session restore
    const activity = ['click', 'keydown', 'pointerdown', 'scroll', 'focus']
    activity.forEach((e) => window.addEventListener(e, ping, { passive: true }))
    document.addEventListener('visibilitychange', ping)
    return () => {
      activity.forEach((e) => window.removeEventListener(e, ping))
      document.removeEventListener('visibilitychange', ping)
    }
  }, [session?.user?.id])

  const refreshProfile = useCallback(() => {
    if (session?.user) return loadProfile(session.user.id)
  }, [session?.user?.id, loadProfile])

  const signInWithGoogle = useCallback(async () => {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }, [])

  const signInWithEmail = useCallback(async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    })
  }, [])

  const signOut = useCallback(async () => {
    return supabase.auth.signOut()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileLoaded,
    loading,
    refreshProfile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
