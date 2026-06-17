import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Landing route for the Google OAuth redirect. The Supabase client picks up the
// session from the URL automatically (detectSessionInUrl); we just wait for the
// auth state to settle and then forward into the app.
export default function AuthCallback() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    navigate(user ? '/' : '/login', { replace: true })
  }, [user, loading, navigate])

  return <div className="spinner" aria-label="Signing you in" />
}
