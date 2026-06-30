import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { GAME_COOLDOWN_MIN } from '../lib/format'
import { SCORE_PROMPT_EVENT } from '../lib/scorePrompt'

// "Score a game" chooser popup, opened on demand via promptScore(sessionId) —
// usually from the FAB while a session is in its scoring window. It pops up over
// whatever page the user is on (no detour through Game Results) and lists the
// games that can still be scored. Picking one starts a draft and routes to the
// recording form; the top entry (when results exist) jumps to Game Results.
// Mounted once in Layout.
export default function ScorePickerModal() {
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const [sessionId, setSessionId] = useState(null)
  const [available, setAvailable] = useState([])
  const [lockedBy, setLockedBy] = useState(new Map())   // lower(game) -> recorder
  const [cooldownUntil, setCooldownUntil] = useState(new Map()) // lower(game) -> ms
  const [playCount, setPlayCount] = useState(new Map())
  const [hasResults, setHasResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (id) => {
    setLoading(true)
    setError('')
    const { data: s } = await supabase
      .from('sessions')
      .select('id, board_games')
      .eq('id', id)
      .maybeSingle()
    if (!s) { setError(t('Session not found.')); setLoading(false); return }

    const [broughtRes, playsRes, draftsRes] = await Promise.all([
      supabase.from('session_brought_games').select('game_name').eq('session_id', id),
      supabase.from('session_game_plays').select('game_name, submitted_at').eq('session_id', id).eq('status', 'submitted'),
      supabase
        .from('session_game_plays')
        .select('game_name, recorded_by, expires_at, recorder:profiles(nickname, display_name)')
        .eq('session_id', id)
        .eq('status', 'draft'),
    ])

    // Available games = host's listed board_games ∪ pledged "bring" games,
    // de-duplicated case-insensitively (keeping the first spelling seen).
    const listed = (s.board_games || '').split(',').map((g) => g.trim()).filter(Boolean)
    const seen = new Map()
    ;[...listed, ...(broughtRes.data ?? []).map((b) => b.game_name)].forEach((g) => {
      const low = g.toLowerCase()
      if (!seen.has(low)) seen.set(low, g)
    })
    setAvailable([...seen.values()])

    const plays = playsRes.data ?? []
    setHasResults(plays.length > 0)

    const counts = new Map()
    const cds = new Map()
    plays.forEach((p) => {
      const low = p.game_name.toLowerCase()
      counts.set(low, (counts.get(low) || 0) + 1)
      if (p.submitted_at) {
        const until = new Date(p.submitted_at).getTime() + GAME_COOLDOWN_MIN * 60_000
        if (until > (cds.get(low) || 0)) cds.set(low, until)
      }
    })
    setPlayCount(counts)
    setCooldownUntil(cds)

    // Other people's live (non-expired) drafts lock a game.
    const locks = new Map()
    ;(draftsRes.data ?? []).forEach((d) => {
      if (d.recorded_by === user.id) return
      if (d.expires_at && new Date(d.expires_at) <= new Date()) return
      locks.set(d.game_name.toLowerCase(), d.recorder)
    })
    setLockedBy(locks)

    setNow(Date.now())
    setLoading(false)
  }, [user?.id, t])

  useEffect(() => {
    const onPrompt = (e) => {
      const id = e.detail?.sessionId
      if (!id) return
      setSessionId(id)
      load(id)
    }
    window.addEventListener(SCORE_PROMPT_EVENT, onPrompt)
    return () => window.removeEventListener(SCORE_PROMPT_EVENT, onPrompt)
  }, [load])

  if (!sessionId) return null

  const close = () => setSessionId(null)

  const startRecording = async (gameName) => {
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('start_game_play', { p_session_id: sessionId, p_game_name: gameName })
    setBusy(false)
    if (e) return setError(e.message)
    const id = sessionId
    setSessionId(null)
    navigate(`/sessions/${id}/score`)
    return data
  }

  const goToResults = () => {
    const id = sessionId
    setSessionId(null)
    navigate(`/sessions/${id}/score`)
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Score a Game')}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{t('Score a Game')}</h2>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div className="spinner" aria-label={t('Loading…')} />
        ) : available.length === 0 && !hasResults ? (
          <p className="muted" style={{ marginTop: 0 }}>{t('No games on this session’s list yet.')}</p>
        ) : (
          <div className="score-game-picker">
            {hasResults && (
              <button type="button" className="score-game-btn" onClick={goToResults}>
                <span className="score-game-name">🏆 {t('Game Results')}</span>
                <span className="score-game-add">{t('See scores you can still edit')}</span>
              </button>
            )}
            {available.map((g) => {
              const low = g.toLowerCase()
              const locker = lockedBy.get(low)
              const n = playCount.get(low) || 0
              const cdUntil = cooldownUntil.get(low) || 0
              const onCooldown = !locker && cdUntil > now
              const cdMins = onCooldown ? Math.max(1, Math.ceil((cdUntil - now) / 60_000)) : 0
              return (
                <button
                  key={g}
                  type="button"
                  className="score-game-btn"
                  disabled={busy || !!locker || onCooldown}
                  onClick={() => startRecording(g)}
                >
                  <span className="score-game-name">{g}</span>
                  {locker ? (
                    <span className="score-game-lock">
                      {t('Being recorded by {name}', { name: locker.nickname || locker.display_name || t('Player') })}
                    </span>
                  ) : onCooldown ? (
                    <span className="score-game-lock">
                      {n > 0 ? t('Played {n}×', { n }) + ' · ' : ''}{cdMins}m
                    </span>
                  ) : n > 0 ? (
                    <span className="score-game-add">{t('Played {n}×', { n })}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
