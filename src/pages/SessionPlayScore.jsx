import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { useGameCatalog } from '../lib/useGameCatalog'
import { groupPlaysByGame } from '../lib/format'
import { buildPlayShareText, shareOrCopy } from '../lib/shareScore'
import GameScoreCard from '../components/GameScoreCard'

// Public, read-only page for ONE recorded play — what a "Share Score" link
// points to. No participant gate (results are public): a chat link preview
// (api/session-preview.js + api/session-image.js) reads the same data anon.
// Every play gets its own permanent URL, so a game played twice on the same
// session is two separate pages ("Wingspan #1", "Wingspan #2"), each with its
// own Share Score button.
export default function SessionPlayScore() {
  const { id, playId } = useParams()
  const { user } = useAuth()
  const { t } = useLang()
  const { catalog } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [entry, setEntry] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [sRes, pRes] = await Promise.all([
        supabase.rpc('get_public_session', { p_id: id }),
        supabase.rpc('get_public_session_plays', { p_session_id: id }),
      ])
      if (!active) return
      if (sRes.error || !sRes.data?.length) {
        setError(sRes.error?.message || t('Session not found.'))
        setEntry(null)
        return
      }
      setSession(sRes.data[0])
      const found = groupPlaysByGame(pRes.data ?? []).find((e) => e.play.id === playId)
      setEntry(found || null)
    })()
    return () => { active = false }
  }, [id, playId, t])

  if (entry === undefined) {
    return <div className="container container-narrow"><div className="spinner" aria-label="Loading" /></div>
  }
  if (!entry) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error || t('This game result could not be found.')}</div>
        <Link to={`/sessions/${id}`} className="btn btn-secondary">{t('← Back to Session')}</Link>
      </div>
    )
  }

  const { play, index, total } = entry
  const canonical = catalog.get((play.game_name || '').trim().toLowerCase()) || play.game_name

  const share = async () => {
    setCopied(false)
    const text = buildPlayShareText({ play, canonical, sessionTitle: session.title, replayIndex: index, replayTotal: total, t })
    const url = `${window.location.origin}/sessions/${id}/score/${playId}`
    await shareOrCopy({ title: `BG Session — ${canonical}`, text, url, t, onCopied: () => setCopied(true) })
  }

  return (
    <div className="container container-narrow">
      <h1 style={{ marginTop: 12, marginBottom: 4 }}>
        {canonical}
        {total > 1 && <span className="score-card-replay" style={{ marginLeft: 8 }}>#{index}</span>}
      </h1>
      <p className="subtitle" style={{ marginTop: 0 }}>{session.title}</p>

      {copied && <div className="alert alert-success" style={{ marginTop: 12 }}>{t('✓ Copied')}</div>}

      <div style={{ marginTop: 16 }}>
        <GameScoreCard
          play={play}
          catalog={catalog}
          hideGameName
          linkPlayers={!!user}
          replayIndex={total > 1 ? index : undefined}
          replayTotal={total > 1 ? total : undefined}
        />
      </div>

      <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={share}>
        {t('Share Score')}
      </button>
      <Link to={`/sessions/${id}`} className="btn btn-secondary btn-block" style={{ marginTop: 10 }}>{t('← Back to Session')}</Link>
    </div>
  )
}
