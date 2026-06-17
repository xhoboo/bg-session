import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import SessionForm from '../components/SessionForm'

const initialForm = {
  title: '',
  startsAt: '',
  area: '',
  fullAddress: '',
  maxPlayers: 4,
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

    if (!form.area) return setError('Please choose a neighborhood area.')
    if (!form.fullAddress.trim()) return setError('Please enter the full address (kept private until you confirm a guest).')

    const startsAtIso = new Date(form.startsAt).toISOString()
    if (Number.isNaN(Date.parse(startsAtIso))) return setError('Please pick a valid date and time.')

    setBusy(true)

    // 1) Create the public session row (no address here).
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .insert({
        host_id: user.id,
        title: form.title.trim(),
        starts_at: startsAtIso,
        area: form.area,
        max_players: Number(form.maxPlayers),
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
      .insert({ session_id: session.id, full_address: form.fullAddress.trim() })

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
