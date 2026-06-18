import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileView from '../components/ProfileView'

// Public, read-only view of another player's profile (linked from sessions).
// Only public fields are shown — real name / gender / in-person photo are
// never displayed here; they appear only to confirmed co-participants inside a
// session. Session history (finished sessions hosted AND joined) comes from the
// user_session_history() function, which exposes only public session fields.
export default function UserProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, domicile, favorite_games, owned_games')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('user_session_history', { uid: id }),
    ]).then(([pubRes, histRes]) => {
      if (!active) return
      setProfile(pubRes.data ?? null)
      const rows = (histRes.data ?? []).sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
      setHistory(rows.map((s) => ({ key: s.role + s.id, session: s, role: s.role })))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  // Viewing your own id: send to the editable own-profile page.
  if (user && id === user.id) return <Navigate to="/profile" replace />

  if (loading) return <div className="spinner" aria-label="Loading" />

  const name = profile?.nickname || profile?.display_name || 'player'

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>
      <div className="spacer" />
      {profile ? (
        <ProfileView
          profile={profile}
          history={history}
          headerAction={
            <Link to={`/messages/${id}`} className="btn btn-secondary btn-sm">💬 Message {name}</Link>
          }
        />
      ) : (
        <div className="alert alert-error">Player not found.</div>
      )}
    </div>
  )
}
