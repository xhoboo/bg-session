import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import SessionForm from '../components/SessionForm'
import { toDatetimeLocalValue } from '../lib/format'

export default function EditSession() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [initial, setInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: s, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (!active) return
      if (sErr || !s) {
        setError(sErr?.message || 'Session not found.')
        setLoading(false)
        return
      }
      if (s.host_id !== user.id) {
        setError('Only the host can edit this session.')
        setLoading(false)
        return
      }

      // Host can read the address (RLS allows it).
      const { data: addr } = await supabase
        .from('session_addresses')
        .select('full_address, maps_url')
        .eq('session_id', id)
        .maybeSingle()

      setInitial({
        title: s.title,
        startsAt: toDatetimeLocalValue(s.starts_at),
        area: s.area,
        fullAddress: addr?.full_address ?? '',
        mapsUrl: addr?.maps_url ?? '',
        minPlayers: s.min_players ?? 1,
        maxPlayers: s.max_players,
        durationMinutes: s.duration_minutes ? String(s.duration_minutes) : '',
        boardGames: s.board_games,
        sessionType: s.session_type,
      })
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [id, user.id])

  const handleSubmit = async (form) => {
    setError('')
    if (!form.area) return setError('Please choose a neighborhood area.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address.')
    if (Number(form.minPlayers) > Number(form.maxPlayers)) return setError('Min players cannot be greater than max players.')

    const startsAtIso = new Date(form.startsAt).toISOString()
    if (Number.isNaN(Date.parse(startsAtIso))) return setError('Please pick a valid date and time.')

    setBusy(true)

    const { error: sErr } = await supabase
      .from('sessions')
      .update({
        title: form.title.trim(),
        starts_at: startsAtIso,
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

    // Upsert the address (it may not exist yet for older sessions).
    const { error: aErr } = await supabase
      .from('session_addresses')
      .upsert({ session_id: id, full_address: form.fullAddress.trim(), maps_url: form.mapsUrl.trim() || null })

    setBusy(false)
    if (aErr) return setError(`Saved, but address update failed: ${aErr.message}`)

    navigate(`/sessions/${id}`)
  }

  if (loading) return <div className="spinner" aria-label="Loading" />

  if (!initial) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error || 'Unable to load session.'}</div>
        <Link to="/my-sessions" className="btn btn-secondary">← My sessions</Link>
      </div>
    )
  }

  return (
    <div className="container container-narrow">
      <Link to={`/sessions/${id}`} className="muted" style={{ fontSize: 14 }}>← Back to session</Link>
      <h1 style={{ marginTop: 12 }}>Edit session</h1>
      <p className="subtitle">Update the details. Confirmed guests will see the new address.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <SessionForm initial={initial} submitLabel="Save changes" busy={busy} onSubmit={handleSubmit} />
    </div>
  )
}
