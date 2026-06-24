import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { isSessionFinished } from '../lib/format'
import { useRegions } from '../lib/useRegions'
import SessionCard from '../components/SessionCard'
import StarRating from '../components/StarRating'
import { SessionListSkeleton } from '../components/Skeleton'

// Parse a session's comma-separated board_games text into a clean list.
const parseGames = (text) => (text || '').split(',').map((g) => g.trim()).filter(Boolean)

export default function Browse() {
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const { regions, areasByRegion } = useRegions()
  const [sessions, setSessions] = useState([])
  const [region, setRegion] = useState('')
  const [area, setArea] = useState('')
  const [game, setGame] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toRate, setToRate] = useState([])
  const [rateValues, setRateValues] = useState({}) // session_id -> chosen star value
  const [ratingId, setRatingId] = useState(null)   // session currently being submitted

  // Finished sessions this user took part in but hasn't rated yet. We also ask
  // the backend to enqueue "rate this session" notifications for them.
  useEffect(() => {
    let active = true
    // Best-effort on-load maintenance. A PostgREST builder is a lazy thenable —
    // it only sends when .then()/await is called — so each call needs .then() to
    // actually fire (and we swallow errors; none of these block the page).
    // pg_cron also runs roll + cancel on a schedule (migration 0033); these keep
    // things fresh between cron ticks for whoever's looking.
    supabase.rpc('enqueue_rating_reminders').then(() => {}, () => {})
    supabase.rpc('enqueue_session_reminders').then(() => {}, () => {}) // day-before + attendance follow-up
    supabase.rpc('cancel_understaffed_sessions').then(() => {}, () => {}) // remove under-min one-time sessions
    supabase.rpc('roll_weekly_sessions').then(() => {}, () => {}) // materialize next week of each weekly session
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
      .select('id, title, starts_at, region, area, max_players, board_games, session_type, recurrence, occurrence_number, confirmed_count, host:profiles(display_name, avatar_url)')
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

  // Submit a star rating straight from the home card, then hand the participant
  // off to the session's optional written review (#review focuses the box there).
  const submitRate = async (sid) => {
    const value = rateValues[sid] || 0
    if (value < 1 || ratingId) return
    setRatingId(sid)
    const { error } = await supabase
      .from('session_ratings')
      .insert({ session_id: sid, user_id: user.id, rating: value })
    setRatingId(null)
    if (error) return setError(error.message)
    navigate(`/sessions/${sid}#review`)
  }

  return (
    <div className="container">
      {toRate.length > 0 && (
        <div className="card rate-reminder">
          <div className="rate-reminder-head">
            <span aria-hidden="true">⭐</span>
            <strong>{t(toRate.length === 1 ? 'Rate your finished session' : 'Rate your finished sessions')}</strong>
          </div>
          <div className="stack" style={{ marginTop: 8 }}>
            {toRate.slice(0, 3).map((s) => (
              <div key={s.id} className="rate-reminder-item rate-reminder-item-inline">
                <Link to={`/sessions/${s.id}`} className="rate-reminder-title">{s.title}</Link>
                <div className="rating-row">
                  <StarRating
                    value={rateValues[s.id] || 0}
                    onChange={(v) => setRateValues((m) => ({ ...m, [s.id]: v }))}
                    size={20}
                    showValue={false}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => submitRate(s.id)}
                    disabled={ratingId === s.id || (rateValues[s.id] || 0) < 1}
                  >
                    {t('Submit rating')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {toRate.length > 3 && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>{t('+{n} more awaiting your rating', { n: toRate.length - 3 })}</p>
          )}
        </div>
      )}

      <div className="row-between" style={{ marginBottom: 4 }}>
        <h1>{t('Upcoming sessions')}</h1>
        <Link to="/create" className="btn btn-primary btn-sm">{t('+ Host a session')}</Link>
      </div>
      <p className="subtitle">{t('Find a board game meetup near you.')}</p>

      <div className="toolbar">
        <select aria-label={t('Filter by region')} value={region} onChange={onRegionChange}>
          <option value="">{t('All regions')}</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select aria-label={t('Filter by area')} value={area} onChange={onAreaChange} disabled={!region}>
          <option value="">{t('All areas')}</option>
          {areaOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select aria-label={t('Filter by board game')} value={game} onChange={(e) => setGame(e.target.value)} disabled={gameOptions.length === 0}>
          <option value="">{t('All games')}</option>
          {gameOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <SessionListSkeleton />
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>{t('No upcoming sessions yet.')}</p>
          <Link to="/create" className="btn btn-primary">{t('Be the first to host')}</Link>
        </div>
      ) : (
        <div className="session-list">
          {visible.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
