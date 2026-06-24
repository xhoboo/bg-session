import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'
import { nicknameFormatError, nicknameTakenError } from '../lib/nickname'
import { cleanupReplacedAvatars } from '../lib/avatarStorage'

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
    const nickErr = nicknameFormatError(vals.nickname)
    if (nickErr) return setError(nickErr)
    if (vals.favoriteGames.length < 1) return setError('Add at least one favorite board game.')

    setBusy(true)
    const takenErr = await nicknameTakenError(vals.nickname, user.id)
    if (takenErr) {
      setBusy(false)
      return setError(takenErr)
    }

    // Upsert (not update): the row is normally created by the on_auth_user_created
    // trigger, but if it's missing an update would silently match 0 rows and the
    // later profile_private upsert would then fail the FK. Upserting guarantees
    // the parent profiles row exists first.
    const { error: pubErr } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        avatar_url: vals.avatarUrl || null,
        nickname: vals.nickname,
        display_name: vals.nickname, // keep the public name in sync
        domicile: vals.domicile || null,
        favorite_games: vals.favoriteGames,
        owned_games: vals.ownedGames,
        onboarded: true,
      })
    if (pubErr) {
      setBusy(false)
      return setError(pubErr.code === '23505' ? 'That nickname is already taken.' : pubErr.message)
    }

    const { error: privErr } = await supabase
      .from('profile_private')
      .upsert({
        id: user.id,
        real_name: vals.realName || null,
        photo_url: vals.photoUrl || null,
      })
    setBusy(false)

    if (privErr) return setError(privErr.message)
    // Clean up any earlier photo this user had on file that's now been replaced.
    await cleanupReplacedAvatars(
      { avatarUrl: profile?.avatar_url, photoUrl: profile?.photo_url },
      { avatarUrl: vals.avatarUrl, photoUrl: vals.photoUrl },
    )
    await refreshProfile()
    navigate('/', { replace: true })
  }

  return (
    <div className="container container-narrow">
      <div className="spacer" />
      <div className="center" style={{ marginBottom: 20 }}>
        <h1 style={{ color: 'var(--teal-700)' }}>
          Welcome to BG Session{' '}
          <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-0.12em' }}>
            <path d="M12 2L22 7L12 12L2 7Z" />
            <path d="M22 7L22 17L12 22L12 12Z" />
            <path d="M2 7L12 12L12 22L2 17Z" />
            <circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="5" cy="11" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="7" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </h1>
        <p className="subtitle" style={{ margin: 0 }}>
          Tell us a bit about yourself to finish setting up your account.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <ProfileForm
        key={profile?.id || 'loading'}
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
