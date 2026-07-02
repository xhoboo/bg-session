import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { useGameCatalog } from '../lib/useGameCatalog'
import GameScoreCard from '../components/GameScoreCard'

// Public, read-only page for ONE recorded play — what a "Share Score" link
// points to (/score/:playId). No participant gate (results are public): a chat
// link preview (api/session-preview.js + api/session-image.js) reads the same
// data anon. Every play has its own permanent URL, so a game played twice on the
// same session is two separate pages ("Wingspan #1", "Wingspan #2"). This page
// is a share TARGET only — it has no Share button of its own; scores are shared
// from the session's ShareScoreButton picker.
export default function SessionPlayScore() {
  const { playId } = useParams()
  const { user } = useAuth()
  const { t } = useLang()
  const { catalog } = useGameCatalog()

  const [data, setData] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      // One call resolves everything from the play id: session id/title, the
      // play's replay position, and the play itself (shaped for GameScoreCard).
      const { data: d, error: e } = await supabase.rpc('get_public_play', { p_play_id: playId })
      if (!active) return
      if (e) setError(e.message)
      setData(d ?? null)
    })()
    return () => { active = false }
  }, [playId])

  if (data === undefined) {
    return <div className="container container-narrow"><div className="spinner" aria-label="Loading" /></div>
  }
  if (!data) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error || t('This game result could not be found.')}</div>
        <Link to="/" className="btn btn-secondary">{t('← Back to Browse')}</Link>
      </div>
    )
  }

  const { play, session_id, session_title, replay_index, replay_total } = data
  const canonical = catalog.get((play.game_name || '').trim().toLowerCase()) || play.game_name

  return (
    <div className="container container-narrow">
      <h1 style={{ marginTop: 12, marginBottom: 4 }}>
        {canonical}
        {replay_total > 1 && <span className="score-card-replay" style={{ marginLeft: 8 }}>#{replay_index}</span>}
      </h1>
      <p className="subtitle" style={{ marginTop: 0 }}>{session_title}</p>

      <div style={{ marginTop: 16 }}>
        <GameScoreCard play={play} catalog={catalog} hideGameName linkPlayers={!!user} />
      </div>

      <Link to={`/sessions/${session_id}`} className="btn btn-secondary btn-block" style={{ marginTop: 16 }}>
        {t('← Back to Session')}
      </Link>
    </div>
  )
}
