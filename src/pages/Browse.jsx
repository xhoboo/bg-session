import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { JAKARTA_AREAS } from '../data/areas'
import SessionCard from '../components/SessionCard'

export default function Browse() {
  const [sessions, setSessions] = useState([])
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
