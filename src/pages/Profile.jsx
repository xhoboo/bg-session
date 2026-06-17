import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileForm, { profileToForm } from '../components/ProfileForm'
import Avatar from '../components/Avatar'
import { formatDateTime } from '../lib/format'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [past, setPast] = useState([])
  const [pastLoading, setPastLoading] = useState(true)

  // Load the archive of past sessions (hosted + joined) for this user.
  useEffect(() => {
    let active = true
    const now = new Date().toISOString()
    Promise.all([
      supabase
        .from('sessions')
        .select('id, title, starts_at, area, confirmed_count, max_players, session_type')
        .eq('host_id', user.id)
        .lt('starts_at', now)
        .order('starts_at', { ascending: false }),
      supabase
        .from('join_requests')
        .select('id, session:sessions(id, title, starts_at, area, confirmed_count, max_players, session_type)')
        .eq('guest_id', user.id)
        .eq('status', 'approved'),
    ]).then(([hostRes, joinRes]) => {
      if (!active) return
      const hosted = (hostRes.data ?? []).map((s) => ({ key: 'h' + s.id, session: s, role: 'Hosted' }))
      const joined = (joinRes.data ?? [])
        .filter((r) => r.session && r.session.starts_at < now)
        .map((r) => ({ key: 'j' + r.id, session: r.session, role: 'Joined' }))
      const all = [...hosted, ...joined].sort((a, b) => (a.session.starts_at < b.session.starts_at ? 1 : -1))
      setPast(all)
      setPastLoading(false)
    })
    return () => {
      active = false
    }
  }, [user.id])

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
        <Avatar name={profile?.nickname || profile?.display_name} src={profile?.avatar_url} size={56} />
        <div>
          <h1 style={{ marginBottom: 2 }}>Profile</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{user.email}</p>
        </div>
      </div>
      <p className="subtitle">Your nickname is shown to other players on your sessions and requests.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Profile updated.</div>}

      <ProfileForm
        key={profile?.id || 'loading'}
        initial={profileToForm(profile)}
        submitLabel="Save profile"
        busy={busy}
        onSubmit={handleSubmit}
      />

      <h2 className="section-title">Past sessions</h2>
      {pastLoading ? (
        <p className="muted">Loading…</p>
      ) : past.length === 0 ? (
        <p className="muted">No past sessions yet. Your archive will appear here after a session's date passes.</p>
      ) : (
        <div className="stack">
          {past.map(({ key, session, role }) => (
            <Link
              to={`/sessions/${session.id}`}
              key={key}
              className="card session-card"
              style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}
            >
              <div className="row-between">
                <span className="session-card-title">{session.title}</span>
                <span className={'badge ' + (role === 'Hosted' ? 'badge-approval' : 'badge-approved')}>{role}</span>
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(session.starts_at)}</span>
                <span><span className="badge badge-area">{session.area}</span></span>
                <span>👥 {session.confirmed_count}/{session.max_players}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
