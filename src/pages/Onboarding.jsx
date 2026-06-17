import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'

// Required one-time profile setup, shown right after a user's first signup.
// The OnboardingGate sends users here until profiles.onboarded = true.
export default function Onboarding() {
  const { user, profile, profileLoaded, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already done? Don't show onboarding again.
  if (profileLoaded && profile?.onboarded) return <Navigate to="/" replace />

  const handleSubmit = async (vals) => {
    setError('')
    if (!vals.nickname) return setError('Please enter a nickname.')
    if (vals.favoriteGames.length < 1) return setError('Add at least one favorite board game.')

    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        real_name: vals.realName || null,
        nickname: vals.nickname,
        display_name: vals.nickname, // keep the public name in sync
        gender: vals.gender || null,
        favorite_games: vals.favoriteGames,
        owned_games: vals.ownedGames,
        onboarded: true,
      })
      .eq('id', user.id)
    setBusy(false)

    if (error) return setError(error.message)
    await refreshProfile()
    navigate('/', { replace: true })
  }

  return (
    <div className="container container-narrow">
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 20 }}>
        <h1 style={{ color: 'var(--teal-700)' }}>Welcome to BG Session 🎲</h1>
        <p className="subtitle" style={{ margin: 0 }}>
          Tell us a bit about yourself to finish setting up your account.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <ProfileForm
        initial={profileToForm(profile)}
        submitLabel="Get started"
        busy={busy}
        onSubmit={handleSubmit}
      />

      <p className="center muted" style={{ marginTop: 16 }}>
        Not you?{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>Sign out</a>
      </p>
    </div>
  )
}
