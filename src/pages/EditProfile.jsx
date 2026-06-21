import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'
import { nicknameFormatError, nicknameTakenError } from '../lib/nickname'

export default function EditProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

    const { error: pubErr } = await supabase
      .from('profiles')
      .update({
        avatar_url: vals.avatarUrl || null,
        nickname: vals.nickname,
        display_name: vals.nickname,
        domicile: vals.domicile || null,
        favorite_games: vals.favoriteGames,
        owned_games: vals.ownedGames,
      })
      .eq('id', user.id)
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
    await refreshProfile()
    navigate('/profile')
  }

  return (
    <div className="container container-narrow">
      <Link to="/profile" className="muted" style={{ fontSize: 14 }}>← Back to profile</Link>
      <h1 style={{ marginTop: 12 }}>Edit profile</h1>
      <p className="subtitle">Update your details and photo.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <ProfileForm
        key={profile?.id || 'loading'}
        initial={profileToForm(profile)}
        submitLabel="Save changes"
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
