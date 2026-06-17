import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../lib/format'

export default function MySessions() {
  const { user } = useAuth()
  const [hosting, setHosting] = useState([])
  const [joined, setJoined] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase
        .from('sessions')
        .select('*')
        .eq('host_id', user.id)
        .order('starts_at', { ascending: true }),
      supabase
        .from('join_requests')
        .select('id, status, session:sessions(id, title, starts_at, area, max_players, confirmed_count, session_type)')
        .eq('guest_id', user.id)
        .order('created_at', { ascending: false }),
    ]).then(([hostRes, joinRes]) => {
      if (!active) return
      setHosting(hostRes.data ?? [])
      setJoined((joinRes.data ?? []).filter((r) => r.session))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [user.id])

  if (loading) return <div className="spinner" aria-label="Loading" />

  return (
    <div className="container">
      <h1>My sessions</h1>
      <p className="subtitle">Sessions you host and sessions you've joined.</p>

      <h2 className="section-title">Hosting ({hosting.length})</h2>
      {hosting.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>You're not hosting anything yet.</p>
          <Link to="/create" className="btn btn-primary">Host a session</Link>
        </div>
      ) : (
        <div className="stack">
          {hosting.map((s) => (
            <Link to={`/sessions/${s.id}`} key={s.id} className="card session-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row-between">
                <span className="session-card-title">{s.title}</span>
                <span className={'badge ' + (s.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
                  {s.session_type === 'open' ? 'Open' : 'Approval'}
                </span>
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(s.starts_at)}</span>
                <span><span className="badge badge-area">{s.area}</span></span>
                <span>👥 {s.confirmed_count}/{s.max_players}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="section-title">Joined / requested ({joined.length})</h2>
      {joined.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>You haven't requested to join any sessions yet.</p>
          <Link to="/" className="btn btn-secondary">Browse sessions</Link>
        </div>
      ) : (
        <div className="stack">
          {joined.map((r) => (
            <Link to={`/sessions/${r.session.id}`} key={r.id} className="card session-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row-between">
                <span className="session-card-title">{r.session.title}</span>
                <span className={'badge badge-' + r.status}>
                  {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Declined' : 'Pending'}
                </span>
              </div>
              <div className="session-meta">
                <span>📅 {formatDateTime(r.session.starts_at)}</span>
                <span><span className="badge badge-area">{r.session.area}</span></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
