import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { isSessionFinished } from '../lib/format'
import { JAKARTA_AREAS } from '../data/areas'
import SessionCard from '../components/SessionCard'

export default function Browse() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toRate, setToRate] = useState([])

  // Finished sessions this user took part in but hasn't rated yet. We also ask
  // the backend to enqueue "rate this session" notifications for them.
  useEffect(() => {
    let active = true
    supabase.rpc('enqueue_rating_reminders')
    supabase.rpc('enqueue_session_reminders') // day-before reminder + attendance follow-up
    ;(async () => {
      const now = new Date().toISOString()
      const [hostRes, joinRes] = await Promise.all([
        supabase.from('sessions').select('id, title, starts_at, duration_minutes').eq('host_id', user.id).lt('starts_at', now),
        supabase
          .from('join_requests')
          .select('session:sessions(id, title, starts_at, duration_minutes)')
          .eq('guest_id', user.id)
          .eq('status', 'approved'),
      ])
      const all = [...(hostRes.data ?? []), ...(joinRes.data ?? []).map((r) => r.session).filter(Boolean)]
      const byId = new Map(all.filter(isSessionFinished).map((s) => [s.id, s]))
      const ids = [...byId.keys()]
      if (!ids.length) {
        if (active) setToRate([])
        return
      }
      const { data: rated } = await supabase
        .from('session_ratings')
        .select('session_id')
        .eq('user_id', user.id)
        .in('session_id', ids)
      const ratedSet = new Set((rated ?? []).map((r) => r.session_id))
      const pending = [...byId.values()]
        .filter((s) => !ratedSet.has(s.id))
        .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
      if (active) setToRate(pending)
    })()
    return () => {
      active = false
    }
  }, [user.id])

  useEffect(() => {
    let active = true
    setLoading(true)

    let query = supabase
      .from('sessions')
      .select('id, title, starts_at, area, max_players, board_games, session_type, confirmed_count, host:profiles(display_name, avatar_url)')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })

    if (area) query = query.eq('area', area)

    query.then(({ data, error }) => {
      if (!active) return
      if (error) setError(error.message)
      else setSessions(data ?? [])
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [area])

  return (
    <div className="container">
      <div className="row-between" style={{ marginBottom: 4 }}>
        <h1>Upcoming sessions</h1>
        <Link to="/create" className="btn btn-primary btn-sm">+ Host a session</Link>
      </div>
      <p className="subtitle">Find a board game meetup near you.</p>

      {toRate.length > 0 && (
        <div className="card rate-reminder">
          <div className="rate-reminder-head">
            <span style={{ fontSize: 22, lineHeight: 1 }}>⭐</span>
            <div>
              <strong>Rate your finished {toRate.length === 1 ? 'session' : 'sessions'}</strong>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                Leave a rating and review to help the group.
              </p>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {toRate.slice(0, 3).map((s) => (
              <Link key={s.id} to={`/sessions/${s.id}`} className="rate-reminder-item">
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <span className="btn btn-primary btn-sm">Rate</span>
              </Link>
            ))}
          </div>
          {toRate.length > 3 && (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>+{toRate.length - 3} more awaiting your rating</p>
          )}
        </div>
      )}

      <div className="toolbar">
        <label className="field-label" htmlFor="filter" style={{ margin: 0 }}>Area</label>
        <select id="filter" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {JAKARTA_AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" aria-label="Loading sessions" />
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <p>No upcoming sessions{area ? ` in ${area}` : ''} yet.</p>
          <Link to="/create" className="btn btn-primary">Be the first to host</Link>
        </div>
      ) : (
        <div className="stack">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
