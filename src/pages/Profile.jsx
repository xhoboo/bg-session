import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { isSessionFinished } from '../lib/format'
import ProfileView from '../components/ProfileView'

export default function Profile() {
  const { user, profile } = useAuth()
  const [history, setHistory] = useState([])

  // Finished sessions (hosted + joined) for this user's history, with avg
  // ratings. "Finished" is start + duration, so in-progress sessions don't show.
  useEffect(() => {
    let active = true
    const now = new Date().toISOString()
    ;(async () => {
      const [hostRes, joinRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, title, starts_at, duration_minutes, area, confirmed_count, max_players, session_type')
          .eq('host_id', user.id)
          .lt('starts_at', now)
          .order('starts_at', { ascending: false }),
        supabase
          .from('join_requests')
          .select('id, session:sessions(id, title, starts_at, duration_minutes, area, confirmed_count, max_players, session_type)')
          .eq('guest_id', user.id)
          .eq('status', 'approved'),
      ])
      const hosted = (hostRes.data ?? [])
        .filter(isSessionFinished)
        .map((s) => ({ key: 'h' + s.id, session: s, role: 'Hosted' }))
      const joined = (joinRes.data ?? [])
        .filter((r) => r.session && isSessionFinished(r.session))
        .map((r) => ({ key: 'j' + r.id, session: r.session, role: 'Joined' }))
      let combined = [...hosted, ...joined].sort((a, b) => (a.session.starts_at < b.session.starts_at ? 1 : -1))

      const ids = combined.map((i) => i.session.id)
      if (ids.length) {
        const { data: rts } = await supabase.from('session_ratings').select('session_id, rating').in('session_id', ids)
        const byId = {}
        ;(rts ?? []).forEach((r) => { (byId[r.session_id] ||= []).push(r.rating) })
        combined = combined.map((i) => {
          const arr = byId[i.session.id]
          return { ...i, rating: arr ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null }
        })
      }
      if (active) setHistory(combined)
    })()
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
