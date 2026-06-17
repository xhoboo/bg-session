import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (vals) => {
    setError('')
    setSaved(false)
    if (!vals.nickname) return setError('Nickname cannot be empty.')
    if (vals.favoriteGames.length < 1) return setError('Add at least one favorite board game.')

    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        real_name: vals.realName || null,
        nickname: vals.nickname,
        display_name: vals.nickname,
        gender: vals.gender || null,
        favorite_games: vals.favoriteGames,
        owned_games: vals.ownedGames,
      })
      .eq('id', user.id)
    setBusy(false)

    if (error) return setError(error.message)
    await refreshProfile()
    setSaved(true)
  }

  return (
    <div className="container container-narrow">
      <div className="profile-header">
        {profile?.avatar_url && (
          <img className="avatar" src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
        )}
        <div>
          <h1 style={{ marginBottom: 2 }}>Profile</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{user.email}</p>
        </div>
      </div>
      <p className="subtitle">Your nickname is shown to other players on your sessions and requests.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Profile updated.</div>}

      {/* `key` re-seeds the form once the profile finishes loading. */}
      <ProfileForm
        key={profile?.id || 'loading'}
        initial={profileToForm(profile)}
        submitLabel="Save profile"
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
