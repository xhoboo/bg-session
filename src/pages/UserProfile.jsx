import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileView from '../components/ProfileView'

// Public, read-only view of another player's profile (linked from sessions).
// Real name / gender / in-person photo come from profile_private, which RLS
// only returns when the viewer shares a confirmed session with this person.
export default function UserProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    const now = new Date().toISOString()
    Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, favorite_games, owned_games')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('profile_private')
        .select('real_name, gender, photo_url')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('sessions')
        .select('id, title, starts_at, area, confirmed_count, max_players, session_type')
        .eq('host_id', id)
        .lt('starts_at', now)
        .order('starts_at', { ascending: false }),
    ]).then(([pubRes, privRes, hostRes]) => {
      if (!active) return
      setProfile(pubRes.data ? { ...pubRes.data, ...(privRes.data ?? {}) } : null)
      setHistory((hostRes.data ?? []).map((s) => ({ key: s.id, session: s, role: 'Hosted' })))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  // Viewing your own id: send to the editable own-profile page.
  if (user && id === user.id) return <Navigate to="/profile" replace />

  if (loading) return <div className="spinner" aria-label="Loading" />

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← Back to browse</Link>
      <div className="spacer" />
      {profile ? (
        <>
          <ProfileView profile={profile} history={history} />
          <div className="spacer" />
          <Link to={`/messages/${id}`} className="btn btn-primary btn-block">💬 Message {profile.nickname || profile.display_name || 'player'}</Link>
        </>
      ) : (
        <div className="alert alert-error">Player not found.</div>
      )}
    </div>
  )
}
