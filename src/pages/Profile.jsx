import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ProfileView from '../components/ProfileView'

export default function Profile() {
  const { user, profile } = useAuth()
  const [history, setHistory] = useState([])

  // Past sessions (hosted + joined) for this user's history.
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
      setHistory([...hosted, ...joined].sort((a, b) => (a.session.starts_at < b.session.starts_at ? 1 : -1)))
    })
    return () => {
      active = false
    }
  }, [user.id])

  return (
    <div className="container container-narrow">
      <ProfileView profile={profile} email={user.email} history={history} />
      <div className="spacer" />
      <Link to="/profile/edit" className="btn btn-primary btn-block">Edit profile</Link>
    </div>
  )
}
