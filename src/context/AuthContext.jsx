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
        .select('id, display_name, avatar_url, nickname, domicile, favorite_games, owned_games, onboarded')
        .eq('id', uid)
        .maybeSingle(),
      supabase
        .from('profile_private')
        .select('real_name, gender, photo_url')
        .eq('id', uid)
        .maybeSingle(),
    ])
    setProfile(pub ? { ...pub, ...(priv ?? {}) } : null)
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
