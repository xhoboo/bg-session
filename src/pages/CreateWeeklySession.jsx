import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import WeeklySessionForm from '../components/WeeklySessionForm'
import { nextWeeklyDate, FALLBACK_DURATION_MIN } from '../lib/format'

const parseGames = (text) => (text || '').split(',').map((s) => s.trim()).filter(Boolean)

const initialForm = {
  title: '',
  weeklyDay: '',
  startTime: '',
  region: '',
  area: '',
  fullAddress: '',
  mapsUrl: '',
  minPlayers: 3,
  maxPlayers: 4,
  durationMinutes: '',
  sessionType: 'approval',
  boardGames: '',
  cohosts: [],
  cohostEditable: [],
}

export default function CreateWeeklySession() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (form) => {
    setError('')

    if (form.weeklyDay === '' || form.weeklyDay == null) return setError('Please choose which day of the week.')
    if (!form.startTime) return setError('Please choose a start time.')
    if (!form.region) return setError('Please choose a region.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address (kept private until you confirm a guest).')
    if (parseGames(form.boardGames).length < 1) return setError('Please add at least one board game.')
    if (Number(form.minPlayers) < 3) return setError('Min players must be at least 3.')
    if (Number(form.minPlayers) > Number(form.maxPlayers)) return setError('Min players cannot be greater than max players.')

    setBusy(true)

    // One weekly session per host.
    const { data: existingSeries } = await supabase
      .from('weekly_series')
      .select('id')
      .eq('host_id', user.id)
      .maybeSingle()
    if (existingSeries) {
      setBusy(false)
      return setError('You already host a weekly session — you can only have one at a time.')
    }

    // Warn early if the first occurrence would overlap a session the host runs.
    const first = nextWeeklyDate(form.weeklyDay, form.startTime)
    if (first) {
      const dur = form.durationMinutes ? Number(form.durationMinutes) : FALLBACK_DURATION_MIN
      const firstStart = first.getTime()
      const firstEnd = firstStart + dur * 60_000
      const { data: actives } = await supabase
        .from('sessions')
        .select('starts_at, duration_minutes')
        .eq('host_id', user.id)
      const clash = (actives ?? []).some((s) => {
        const st = new Date(s.starts_at).getTime()
        const en = st + (s.duration_minutes || FALLBACK_DURATION_MIN) * 60_000
        return en > Date.now() && st < firstEnd && en > firstStart
      })
      if (clash) {
        setBusy(false)
        return setError('Your first weekly session would overlap another session you host. Pick a different day or time.')
      }
    }

    // 1) Create the series (template / source of truth).
    const { data: series, error: serErr } = await supabase
      .from('weekly_series')
      .insert({
        host_id: user.id,
        title: form.title.trim(),
        weekly_day: Number(form.weeklyDay),
        start_time: form.startTime,
        duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        region: form.region,
        area: form.area,
        min_players: Number(form.minPlayers),
        max_players: Number(form.maxPlayers),
        session_type: form.sessionType,
        cohost_editable: form.cohostEditable || [],
        full_address: form.fullAddress.trim(),
        maps_url: form.mapsUrl.trim() || null,
      })
      .select('id')
      .single()

    if (serErr) {
      setBusy(false)
      if (serErr.code === '23505') return setError('You already host a weekly session — you can only have one at a time.')
      return setError(serErr.message)
    }

    // 2) Save co-hosts.
    const cohosts = form.cohosts || []
    if (cohosts.length) {
      const { error: chErr } = await supabase
        .from('weekly_cohosts')
        .insert(cohosts.map((c) => ({ series_id: series.id, user_id: c.id })))
      if (chErr) {
        setBusy(false)
        return setError(`Weekly session created, but co-hosts failed to save: ${chErr.message}`)
      }
    }

    // 3) Generate the first occurrence (+ co-host participants) via the roll RPC.
    const { error: rollErr } = await supabase.rpc('roll_weekly_sessions')
    if (rollErr) {
      setBusy(false)
      return setError(rollErr.message)
    }

    // 4) Find that occurrence and seed this week's board games.
    const { data: occ } = await supabase
      .from('sessions')
      .select('id')
      .eq('series_id', series.id)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (occ && form.boardGames.trim()) {
      await supabase.from('sessions').update({ board_games: form.boardGames.trim() }).eq('id', occ.id)
    }

    setBusy(false)
    navigate(occ ? `/sessions/${occ.id}` : '/my-sessions')
  }

  return (
    <div className="container container-narrow">
      <Link to="/create" className="muted" style={{ fontSize: 14 }}>← Back</Link>
      <h1 style={{ marginTop: 12 }}>Host a weekly session</h1>
      <p className="subtitle">
        Repeats every week. After each week ends, players and board games reset (your co-hosts stay),
        and the date rolls forward automatically.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <WeeklySessionForm
        initial={initialForm}
        submitLabel="Create weekly session"
        busy={busy}
        onSubmit={handleSubmit}
        selfId={user.id}
      />
    </div>
  )
}
