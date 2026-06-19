import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { isSessionFinished } from '../lib/format'
import { useRegions } from '../lib/useRegions'
import SessionCard from '../components/SessionCard'

// Parse a session's comma-separated board_games text into a clean list.
const parseGames = (text) => (text || '').split(',').map((g) => g.trim()).filter(Boolean)

export default function Browse() {
  const { user } = useAuth()
  const { regions, areasByRegion } = useRegions()
  const [sessions, setSessions] = useState([])
  const [region, setRegion] = useState('')
  const [area, setArea] = useState('')
  const [game, setGame] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toRate, setToRate] = useState([])

  // Finished sessions this user took part in but hasn't rated yet. We also ask
  // the backend to enqueue "rate this session" notifications for them.
  useEffect(() => {
    let active = true
    supabase.rpc('enqueue_rating_reminders')
    supabase.rpc('enqueue_session_reminders') // day-before reminder + attendance follow-up
    supabase.rpc('cancel_understaffed_sessions') // delete sessions that didn't reach min players
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

  // Fetch all upcoming sessions once; the three filters below are applied
  // client-side so we can also derive the board-game options from what's
  // actually on offer.
  useEffect(() => {
    let active = true
    setLoading(true)

    supabase
      .from('sessions')
      .select('id, title, starts_at, region, area, max_players, board_games, session_type, confirmed_count, host:profiles(display_name, avatar_url)')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setSessions(data ?? [])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // Area options follow the chosen region; board-game options are the distinct
  // games in upcoming sessions that match the current region + area filter.
  const areaOptions = region ? areasByRegion[region] || [] : []
  const gameOptions = useMemo(() => {
    const byKey = new Map() // lowercased name -> first-seen display name
    for (const s of sessions) {
      if (region && s.region !== region) continue
      if (area && s.area !== area) continue
      for (const g of parseGames(s.board_games)) {
        const key = g.toLowerCase()
        if (!byKey.has(key)) byKey.set(key, g)
      }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b))
  }, [sessions, region, area])

  const visible = sessions.filter((s) => {
    if (region && s.region !== region) return false
    if (area && s.area !== area) return false
    if (game && !parseGames(s.board_games).some((g) => g.toLowerCase() === game.toLowerCase())) return false
    return true
  })

  // Changing a parent filter invalidates its narrower children.
  const onRegionChange = (e) => { setRegion(e.target.value); setArea(''); setGame('') }
  const onAreaChange = (e) => { setArea(e.target.value); setGame('') }

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
        <select aria-label="Filter by region" value={region} onChange={onRegionChange}>
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select aria-label="Filter by area" value={area} onChange={onAreaChange} disabled={!region}>
          <option value="">All areas</option>
          {areaOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select aria-label="Filter by board game" value={game} onChange={(e) => setGame(e.target.value)} disabled={gameOptions.length === 0}>
          <option value="">All games</option>
          {gameOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner" aria-label="Loading sessions" />
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>No upcoming sessions{region ? ` in ${area || region}` : ''}{game ? ` with ${game}` : ''} yet.</p>
          <Link to="/create" className="btn btn-primary">Be the first to host</Link>
        </div>
      ) : (
        <div className="stack">
          {visible.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
