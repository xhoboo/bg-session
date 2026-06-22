import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import SessionForm from '../components/SessionForm'
import { FALLBACK_DURATION_MIN } from '../lib/format'

const parseGames = (text) => (text || '').split(',').map((s) => s.trim()).filter(Boolean)

const initialForm = {
  title: '',
  startsAt: '',
  region: '',
  area: '',
  fullAddress: '',
  mapsUrl: '',
  minPlayers: 3,
  maxPlayers: 4,
  durationMinutes: '',
  boardGames: '',
  sessionType: 'approval',
}

export default function CreateSession() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (form) => {
    setError('')

    if (!form.region) return setError('Please choose a region.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address (kept private until you confirm a guest).')
    if (parseGames(form.boardGames).length < 1) return setError('Please add at least one board game.')
    if (Number(form.minPlayers) < 3) return setError('Min players must be at least 3.')
    if (Number(form.minPlayers) > Number(form.maxPlayers)) return setError('Min players cannot be greater than max players.')

    const startsAtIso = new Date(form.startsAt).toISOString()
    if (Number.isNaN(Date.parse(startsAtIso))) return setError('Please pick a valid date and time.')

    setBusy(true)

    // Mirror the server-side limits (migration 0030) for instant feedback.
    const dur = form.durationMinutes ? Number(form.durationMinutes) : FALLBACK_DURATION_MIN
    const newStart = new Date(startsAtIso).getTime()
    const newEnd = newStart + dur * 60_000
    const { data: mine } = await supabase
      .from('sessions')
      .select('starts_at, duration_minutes, recurrence')
      .eq('host_id', user.id)
    const live = (mine ?? []).filter(
      (s) => new Date(s.starts_at).getTime() + (s.duration_minutes || FALLBACK_DURATION_MIN) * 60_000 > Date.now()
    )
    const overlaps = live.some((s) => {
      const st = new Date(s.starts_at).getTime()
      const en = st + (s.duration_minutes || FALLBACK_DURATION_MIN) * 60_000
      return st < newEnd && en > newStart
    })
    if (overlaps) {
      setBusy(false)
      return setError('You already host a session that overlaps this time — the next one can only start after the previous ends.')
    }

    // You also can't host on top of a session you're attending (migration 0042).
    const { data: joined } = await supabase
      .from('join_requests')
      .select('session:sessions(starts_at, duration_minutes)')
      .eq('guest_id', user.id)
      .eq('status', 'approved')
    const attends = (joined ?? [])
      .map((r) => r.session)
      .filter(Boolean)
      .some((s) => {
        const st = new Date(s.starts_at).getTime()
        const en = st + (s.duration_minutes || FALLBACK_DURATION_MIN) * 60_000
        return en > Date.now() && st < newEnd && en > newStart
      })
    if (attends) {
      setBusy(false)
      return setError('You are already attending a session at this time. Pick a different day or time for the one you host.')
    }
    if (live.filter((s) => s.recurrence !== 'weekly').length >= 2) {
      setBusy(false)
      return setError('You can host at most 2 active one-time sessions at a time.')
    }

    // 1) Create the public session row (no address here).
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .insert({
        host_id: user.id,
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
      .select('id')
      .single()

    if (sessionErr) {
      setBusy(false)
      return setError(sessionErr.message)
    }

    // 2) Store the private address in its own protected table.
    const { error: addrErr } = await supabase
      .from('session_addresses')
      .insert({ session_id: session.id, full_address: form.fullAddress.trim(), maps_url: form.mapsUrl.trim() || null })

    setBusy(false)
    if (addrErr) return setError(`Session created but address failed to save: ${addrErr.message}`)

    navigate(`/sessions/${session.id}`)
  }

  return (
    <div className="container container-narrow">
      <h1>Host a session</h1>
      <p className="subtitle">Set up your board game meetup. Your exact address stays hidden until you confirm a guest.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <SessionForm initial={initialForm} submitLabel="Create session" busy={busy} onSubmit={handleSubmit} />
    </div>
  )
}
