import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'
import { nicknameFormatError, nicknameTakenError } from '../lib/nickname'
import { cleanupReplacedAvatars } from '../lib/avatarStorage'

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
    if (vals.domicile.trim().length > 20) return setError('Domicile must be 20 characters or fewer.')
    if (vals.realName.length > 30) return setError('Real name must be 30 characters or fewer.')

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
    // New URLs are now persisted — safe to delete the files they replaced.
    await cleanupReplacedAvatars(
      { avatarUrl: profile?.avatar_url, photoUrl: profile?.photo_url },
      { avatarUrl: vals.avatarUrl, photoUrl: vals.photoUrl },
    )
    await refreshProfile()
    navigate('/profile')
  }

  return (
    <div className="container container-narrow">
      <h1 style={{ marginTop: 12, marginBottom: 20 }}>Edit Profile</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <ProfileForm
        key={profile?.id || 'loading'}
        initial={profileToForm(profile)}
        submitLabel="Save Changes"
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
