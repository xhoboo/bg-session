import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import SessionForm from '../components/SessionForm'
import WeeklySessionForm from '../components/WeeklySessionForm'
import { toDatetimeLocalValue, hasSessionStarted, nextWeeklyDate } from '../lib/format'

const parseGames = (text) => (text || '').split(',').map((s) => s.trim()).filter(Boolean)

export default function EditSession() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState(null) // 'one_time' | 'weekly'
  const [initial, setInitial] = useState(null)
  const [series, setSeries] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [origCohostIds, setOrigCohostIds] = useState([])
  const [origSchedule, setOrigSchedule] = useState({ weeklyDay: '', startTime: '' })
  const [candidates, setCandidates] = useState([]) // confirmed participants eligible to be co-hosts
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: s, error: sErr } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle()
      if (!active) return
      if (sErr || !s) {
        setError(sErr?.message || 'Session not found.')
        setLoading(false)
        return
      }

      const host = s.host_id === user.id

      // Weekly: co-hosts may also edit (the form/triggers limit which fields).
      let cohost = false
      let cohostsList = []
      if (s.series_id) {
        const { data: ch } = await supabase
          .from('weekly_cohosts')
          .select('user_id, profile:profiles(id, nickname, display_name, avatar_url)')
          .eq('series_id', s.series_id)
        cohostsList = (ch ?? []).map((r) => r.profile).filter(Boolean)
        cohost = (ch ?? []).some((r) => r.user_id === user.id)
      }

      if (!host && !cohost) {
        setError('Only the host or a co-host can edit this session.')
        setLoading(false)
        return
      }
      if (hasSessionStarted(s)) {
        setError('This session has already started and can no longer be edited.')
        setLoading(false)
        return
      }

      // ---- One-time session ----
      if (!s.series_id) {
        const { data: addr } = await supabase
          .from('session_addresses')
          .select('full_address, maps_url')
          .eq('session_id', id)
          .maybeSingle()
        setMode('one_time')
        setIsHost(host)
        setInitial({
          title: s.title,
          startsAt: toDatetimeLocalValue(s.starts_at),
          region: s.region ?? '',
          area: s.area,
          fullAddress: addr?.full_address ?? '',
          mapsUrl: addr?.maps_url ?? '',
          minPlayers: s.min_players ?? 3,
          maxPlayers: s.max_players,
          durationMinutes: s.duration_minutes ? String(s.duration_minutes) : '',
          boardGames: s.board_games,
          sessionType: s.session_type,
        })
        setLoading(false)
        return
      }

      // ---- Weekly occurrence: template lives in weekly_series ----
      const { data: ws } = await supabase.from('weekly_series').select('*').eq('id', s.series_id).maybeSingle()
      if (!ws) {
        setError('Weekly session template not found.')
        setLoading(false)
        return
      }
      // Co-hosts can only be appointed from confirmed participants of this
      // occurrence (co-hosts are themselves auto-approved, so they're included).
      const { data: approved } = await supabase
        .from('join_requests')
        .select('guest:profiles(id, nickname, display_name, avatar_url)')
        .eq('session_id', id)
        .eq('status', 'approved')
      setCandidates((approved ?? []).map((r) => r.guest).filter(Boolean))

      const startTime = (ws.start_time || '').slice(0, 5) // "HH:MM"
      setSeries(ws)
      setIsHost(host)
      setOrigSchedule({ weeklyDay: String(ws.weekly_day), startTime })
      setOrigCohostIds(cohostsList.map((c) => c.id))
      setInitial({
        title: ws.title,
        weeklyDay: String(ws.weekly_day),
        startTime,
        region: ws.region ?? '',
        area: ws.area,
        fullAddress: ws.full_address ?? '',
        mapsUrl: ws.maps_url ?? '',
        minPlayers: ws.min_players ?? 3,
        maxPlayers: ws.max_players,
        durationMinutes: ws.duration_minutes ? String(ws.duration_minutes) : '',
        sessionType: ws.session_type,
        boardGames: s.board_games,
        cohosts: cohostsList.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          display_name: c.display_name,
          avatar_url: c.avatar_url,
        })),
        cohostEditable: ws.cohost_editable || [],
      })
      setMode('weekly')
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [id, user.id])

  const handleSubmitOneTime = async (form) => {
    setError('')
    if (!form.region) return setError('Please choose a region.')
    if (form.title.trim().length > 30) return setError('Session title must be 30 characters or fewer.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address.')
    if (form.fullAddress.trim().length > 75) return setError('The full address must be 75 characters or fewer.')
    if (parseGames(form.boardGames).length < 1) return setError('Please add at least one board game.')
    if (Number(form.minPlayers) < 3) return setError('Min players must be at least 3.')
    if (Number(form.minPlayers) > Number(form.maxPlayers)) return setError('Min players cannot be greater than max players.')

    const startsAtIso = new Date(form.startsAt).toISOString()
    if (Number.isNaN(Date.parse(startsAtIso))) return setError('Please pick a valid date and time.')
    if (new Date(startsAtIso).getTime() <= Date.now()) return setError("You can't use a date and time that has already passed.")

    setBusy(true)
    const { error: sErr } = await supabase
      .from('sessions')
      .update({
        title: form.title.trim(),
        starts_at: startsAtIso,
        region: form.region,
        area: form.area,
        min_players: Number(form.minPlayers),
        max_players: Number(form.maxPlayers),
        duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        board_games: form.boardGames.trim(),
        session_type: form.sessionType,
      })
      .eq('id', id)

    if (sErr) {
      setBusy(false)
      return setError(sErr.message)
    }

    const { error: aErr } = await supabase
      .from('session_addresses')
      .upsert({ session_id: id, full_address: form.fullAddress.trim(), maps_url: form.mapsUrl.trim() || null })

    setBusy(false)
    if (aErr) return setError(`Saved, but address update failed: ${aErr.message}`)
    navigate(`/sessions/${id}`)
  }

  const handleSubmitWeekly = async (form) => {
    setError('')
    if (form.weeklyDay === '' || form.weeklyDay == null) return setError('Please choose which day of the week.')
    if (!form.startTime) return setError('Please choose a start time.')
    if (!form.region) return setError('Please choose a region.')
    if (form.title.trim().length > 30) return setError('Session title must be 30 characters or fewer.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address.')
    if (form.fullAddress.trim().length > 75) return setError('The full address must be 75 characters or fewer.')
    if (Number(form.minPlayers) < 3) return setError('Min players must be at least 3.')
    if (Number(form.minPlayers) > Number(form.maxPlayers)) return setError('Min players cannot be greater than max players.')

    const editableKeys = isHost ? null : series?.cohost_editable || []
    const canLocation = isHost || editableKeys.includes('location')
    const canGames = isHost || editableKeys.includes('board_games')
    // Only enforce "at least one game" on whoever actually controls the games.
    if (canGames && parseGames(form.boardGames).length < 1) return setError('Please add at least one board game.')

    setBusy(true)

    // 1) Update the series template (the source of truth for next weeks).
    const seriesPayload = {
      title: form.title.trim(),
      weekly_day: Number(form.weeklyDay),
      start_time: form.startTime,
      duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      region: form.region,
      area: form.area,
      min_players: Number(form.minPlayers),
      max_players: Number(form.maxPlayers),
      session_type: form.sessionType,
      full_address: form.fullAddress.trim(),
      maps_url: form.mapsUrl.trim() || null,
    }
    if (isHost) seriesPayload.cohost_editable = form.cohostEditable || []
    const { error: serErr } = await supabase.from('weekly_series').update(seriesPayload).eq('id', series.id)
    if (serErr) {
      setBusy(false)
      return setError(serErr.message)
    }

    // 2) Sync this week's occurrence to match.
    const occPayload = {
      title: form.title.trim(),
      region: form.region,
      area: form.area,
      min_players: Number(form.minPlayers),
      max_players: Number(form.maxPlayers),
      duration_minutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      session_type: form.sessionType,
      board_games: form.boardGames.trim(),
    }
    // Only reschedule when the day/time actually changed (avoids needless
    // starts_at churn and tz-drift between JS and the DB's WIB calculation).
    const scheduleChanged =
      String(form.weeklyDay) !== origSchedule.weeklyDay || form.startTime !== origSchedule.startTime
    if (scheduleChanged) {
      const next = nextWeeklyDate(form.weeklyDay, form.startTime)
      if (next) occPayload.starts_at = next.toISOString()
    }
    const { error: occErr } = await supabase.from('sessions').update(occPayload).eq('id', id)
    if (occErr) {
      setBusy(false)
      return setError(occErr.message)
    }

    // 3) Sync the occurrence address (only if this editor may change location).
    // The address row already exists (the roll function created it), so UPDATE —
    // not upsert — keeps a co-host clear of the host-only INSERT policy.
    if (canLocation) {
      const { error: addrErr } = await supabase
        .from('session_addresses')
        .update({ full_address: form.fullAddress.trim(), maps_url: form.mapsUrl.trim() || null })
        .eq('session_id', id)
      if (addrErr) {
        setBusy(false)
        return setError(`Saved, but address update failed: ${addrErr.message}`)
      }
    }

    // 4) Apply co-host add/remove (host only).
    if (isHost) {
      const newIds = (form.cohosts || []).map((c) => c.id)
      const added = newIds.filter((x) => !origCohostIds.includes(x))
      const removed = origCohostIds.filter((x) => !newIds.includes(x))
      for (const uid of added) {
        const { error: e } = await supabase.rpc('add_weekly_cohost', { p_series_id: series.id, p_user_id: uid })
        if (e) {
          setBusy(false)
          return setError(e.message)
        }
      }
      for (const uid of removed) {
        const { error: e } = await supabase.rpc('remove_weekly_cohost', { p_series_id: series.id, p_user_id: uid })
        if (e) {
          setBusy(false)
          return setError(e.message)
        }
      }
    }

    setBusy(false)
    navigate(`/sessions/${id}`)
  }

  // Hand the weekly session to a confirmed participant. The RPC moves the series
  // + upcoming occurrence to them, drops their join_request, and re-adds the old
  // host (this user) as an approved participant — so we just leave to My sessions.
  const handleTransfer = async (newHostId) => {
    if (!newHostId) return
    const target = candidates.find((c) => c.id === newHostId)
    const name = target?.nickname || target?.display_name || 'this participant'
    if (!window.confirm(`Transfer hosting to ${name}? They become the host of this weekly session and you stay on as a regular participant.`)) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('transfer_weekly_host', {
      p_series_id: series.id,
      p_new_host_id: newHostId,
    })
    setBusy(false)
    if (e) return setError(e.message)
    navigate('/my-sessions', { replace: true })
  }

  if (loading) return <div className="spinner" aria-label="Loading" />

  if (!initial) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error || 'Unable to load session.'}</div>
        <Link to="/my-sessions" className="btn btn-secondary">← My Sessions</Link>
      </div>
    )
  }

  return (
    <div className="container container-narrow">
      <h1 style={{ marginTop: 12 }}>Edit {mode === 'weekly' ? 'Weekly Session' : 'Session'}</h1>
      {mode === 'weekly' && (
        <p className="subtitle">
          Changes apply to this week and every week going forward. Board games are just for this week.
        </p>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {mode === 'weekly' ? (
        <WeeklySessionForm
          initial={initial}
          submitLabel="Save Changes"
          busy={busy}
          onSubmit={handleSubmitWeekly}
          showCohostAdmin={isHost}
          editableKeys={isHost ? null : series?.cohost_editable || []}
          selfId={user.id}
          candidates={candidates}
          onTransfer={isHost ? handleTransfer : null}
        />
      ) : (
        <SessionForm initial={initial} submitLabel="Save Changes" busy={busy} onSubmit={handleSubmitOneTime} />
      )}
    </div>
  )
}
