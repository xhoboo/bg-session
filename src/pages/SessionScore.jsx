import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../lib/i18n'
import { useGameCatalog } from '../lib/useGameCatalog'
import {
  isScoringOpen, scoringClosesAt, hasSessionStarted, SCORE_MODES, scoreMode,
  teamLetter, formatDateShort, gameAnchor,
} from '../lib/format'
import Avatar from '../components/Avatar'
import GameScoreCard from '../components/GameScoreCard'

// Embedded select for a submitted play + its players and teams. Scores are
// public, so this needs no participant gate to read.
const PLAY_SELECT = `
  id, game_name, mode, lowest_wins, coop_won, recorded_by, submitted_at, status,
  recorder:profiles(nickname, display_name, avatar_url),
  scores:session_play_scores(user_id, score, is_winner, team, player:profiles(nickname, display_name, avatar_url)),
  teams:session_play_teams(team, score, is_winner)
`

export default function SessionScore() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const { catalog } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [available, setAvailable] = useState([]) // game names that may be scored
  const [plays, setPlays] = useState([])          // submitted results
  const [drafts, setDrafts] = useState([])        // live "being recorded" locks
  const [draftId, setDraftId] = useState(null)    // my open draft (form target)
  const [draftGame, setDraftGame] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('id, title, host_id, starts_at, duration_minutes, board_games')
      .eq('id', id)
      .maybeSingle()
    if (sErr || !s) {
      setError(sErr?.message || 'Session not found.')
      setLoading(false)
      return
    }
    setSession(s)

    // Participants (host + approved guests) — the pool of possible players.
    const [hostRes, guestsRes, broughtRes, playsRes, draftsRes] = await Promise.all([
      supabase.from('profiles').select('id, nickname, display_name, avatar_url').eq('id', s.host_id).maybeSingle(),
      supabase
        .from('join_requests')
        .select('guest:profiles(id, nickname, display_name, avatar_url)')
        .eq('session_id', id)
        .eq('status', 'approved'),
      supabase.from('session_brought_games').select('game_name').eq('session_id', id),
      supabase.from('session_game_plays').select(PLAY_SELECT).eq('session_id', id).eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase
        .from('session_game_plays')
        .select('id, game_name, recorded_by, expires_at, recorder:profiles(nickname, display_name, avatar_url)')
        .eq('session_id', id)
        .eq('status', 'draft'),
    ])

    const people = []
    if (hostRes.data) people.push({ ...hostRes.data, isHost: true })
    ;(guestsRes.data ?? []).forEach((r) => r.guest && people.push({ ...r.guest, isHost: false }))
    setParticipants(people)

    // Available games = host's listed board_games ∪ pledged "bring" games,
    // de-duplicated case-insensitively (keeping the first spelling seen).
    const listed = (s.board_games || '').split(',').map((g) => g.trim()).filter(Boolean)
    const seen = new Map()
    ;[...listed, ...(broughtRes.data ?? []).map((b) => b.game_name)].forEach((g) => {
      const low = g.toLowerCase()
      if (!seen.has(low)) seen.set(low, g)
    })
    setAvailable([...seen.values()])

    setPlays(playsRes.data ?? [])

    // Only non-expired drafts are real locks.
    const liveDrafts = (draftsRes.data ?? []).filter((d) => !d.expires_at || new Date(d.expires_at) > new Date())
    setDrafts(liveDrafts)
    const mine = liveDrafts.find((d) => d.recorded_by === user.id)
    if (mine) {
      setDraftId(mine.id)
      setDraftGame(mine.game_name)
    }

    setLoading(false)
  }, [id, user.id])

  useEffect(() => { load() }, [load])

  // Live updates: another participant starting a recording (a lock) or a new
  // result landing should show up without a manual refresh. Reload on any change
  // to this session's plays, unless we're mid-form (don't yank the form away).
  useEffect(() => {
    const channel = supabase
      .channel('plays-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_game_plays', filter: `session_id=eq.${id}` }, () => {
        if (!draftId) load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, draftId, load])

  const isParticipant = session && (session.host_id === user.id || participants.some((p) => p.id === user.id))
  const scoringOpen = session && isScoringOpen(session)

  // Lock map: lower(game) -> the OTHER person's live draft (mine isn't a lock).
  const lockedBy = useMemo(() => {
    const m = new Map()
    drafts.forEach((d) => {
      if (d.recorded_by !== user.id) m.set(d.game_name.toLowerCase(), d.recorder)
    })
    return m
  }, [drafts, user.id])

  // How many submitted plays exist per game (for the "Played n×" hint).
  const playCount = useMemo(() => {
    const m = new Map()
    plays.forEach((p) => m.set(p.game_name.toLowerCase(), (m.get(p.game_name.toLowerCase()) || 0) + 1))
    return m
  }, [plays])

  // The first (top) card for each game gets a deep-link anchor id (play.id →
  // anchor), so a game chip on the session page can jump straight to it.
  const anchorFor = useMemo(() => {
    const seen = new Set()
    const m = new Map()
    plays.forEach((p) => {
      const low = p.game_name.toLowerCase()
      if (!seen.has(low)) { seen.add(low); m.set(p.id, gameAnchor(p.game_name)) }
    })
    return m
  }, [plays])

  // Arriving from a game chip (…/score#game-x): once the results are rendered,
  // scroll that game's card into view. The :target CSS then highlights it.
  useEffect(() => {
    if (loading || !location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, location.hash])

  const startRecording = async (gameName) => {
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('start_game_play', { p_session_id: id, p_game_name: gameName })
    setBusy(false)
    if (e) return setError(e.message)
    setDraftId(data)
    setDraftGame(gameName)
    setDrafts((prev) => [...prev, { id: data, game_name: gameName, recorded_by: user.id }])
  }

  const discardDraft = async () => {
    if (!draftId) return
    setBusy(true)
    await supabase.rpc('delete_game_play', { p_play_id: draftId }).then(() => {}, () => {})
    setBusy(false)
    setDraftId(null)
    setDraftGame('')
    await load()
  }

  const cancelResult = async (play) => {
    if (!window.confirm(t('Remove this game from the session record? This can’t be undone.'))) return
    setBusy(true)
    const { error: e } = await supabase.rpc('delete_game_play', { p_play_id: play.id })
    setBusy(false)
    if (e) return setError(e.message)
    await load()
  }

  const onSubmitted = async () => {
    setDraftId(null)
    setDraftGame('')
    await load()
  }

  if (loading) {
    return <div className="container container-narrow"><div className="spinner" aria-label="Loading" /></div>
  }
  if (error && !session) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-secondary">{t('← Back to browse')}</Link>
      </div>
    )
  }
  if (!isParticipant) {
    // Results are public, but recording is participant-only — send onlookers to
    // the detail page where the read-only results live.
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{t('Only participants can record scores')}</div>
        <Link to={`/sessions/${id}`} className="btn btn-secondary">{t('← Back to session')}</Link>
      </div>
    )
  }

  const started = hasSessionStarted(session)
  const myDraft = drafts.find((d) => d.id === draftId)

  return (
    <div className="container container-narrow">
      <Link to={`/sessions/${id}`} className="muted" style={{ fontSize: 14 }}>{t('← Back to session')}</Link>
      <h1 style={{ marginTop: 12, marginBottom: 4 }}>{t('Game results')}</h1>
      <p className="subtitle" style={{ marginTop: 0 }}>{session.title}</p>

      {/* Scoring-window banner */}
      {scoringOpen ? (
        <div className="score-window-open">
          ⏱️ {t('Scoring is open')} · {t('Scoring closes {time}', { time: formatDateShort(scoringClosesAt(session)) })}
        </div>
      ) : (
        <div className="score-window-closed">
          {started ? t('Scoring for this session has closed.') : t('Scoring opens once the session starts.')}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

      {/* ---- Recording ---- */}
      {scoringOpen && (
        myDraft ? (
          <RecordForm
            playId={draftId}
            gameName={draftGame}
            participants={participants}
            busy={busy}
            setBusy={setBusy}
            onSubmitted={onSubmitted}
            onDiscard={discardDraft}
          />
        ) : (
          <>
            <h2 className="section-title">{t('Score a game')}</h2>
            <p className="muted" style={{ marginTop: -4 }}>
              {t('Add the result of a game played from this session’s line-up. Anyone here can record a game.')}
            </p>
            {available.length === 0 ? (
              <p className="muted">{t('No games on this session’s list yet.')}</p>
            ) : (
              <div className="score-game-grid">
                {available.map((g) => {
                  const locker = lockedBy.get(g.toLowerCase())
                  const n = playCount.get(g.toLowerCase()) || 0
                  return (
                    <button
                      key={g}
                      type="button"
                      className="score-game-btn"
                      disabled={busy || !!locker}
                      onClick={() => startRecording(g)}
                    >
                      <span className="score-game-name">{g}</span>
                      {locker ? (
                        <span className="score-game-lock">
                          {t('Being recorded by {name}', { name: locker.nickname || locker.display_name || t('Player') })}
                        </span>
                      ) : (
                        <span className="score-game-add">
                          {n > 0 ? t('Played {n}×', { n }) + ' · ' : ''}{t('Record scores')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )
      )}

      {/* ---- Results ---- */}
      <h2 className="section-title">{t('Game results')}</h2>
      {plays.length === 0 ? (
        <p className="muted">{t('No games have been scored yet.')}</p>
      ) : (
        <div className="stack">
          {plays.map((p) => {
            // The recorder can cancel within 30 minutes of submitting.
            const cancellable =
              p.recorded_by === user.id &&
              p.submitted_at &&
              Date.now() < new Date(p.submitted_at).getTime() + 30 * 60_000
            return (
              <GameScoreCard
                key={p.id}
                id={anchorFor.get(p.id)}
                play={p}
                catalog={catalog}
                onCancel={cancellable && scoringOpen ? cancelResult : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RecordForm — fills in a draft and submits it. Lives here because it's tightly
// bound to the page's participant list and draft lifecycle.
// ---------------------------------------------------------------------------
function RecordForm({ playId, gameName, participants, busy, setBusy, onSubmitted, onDiscard }) {
  const { t } = useLang()
  const [modeKey, setModeKey] = useState('individual_score')
  const [selected, setSelected] = useState({})   // userId -> { score, team }
  const [winnerId, setWinnerId] = useState(null) // individual_winloss
  const [winnerTeam, setWinnerTeam] = useState(null) // team_winloss
  const [teamScores, setTeamScores] = useState({}) // team(int) -> score string
  const [lowestWins, setLowestWins] = useState(false)
  const [coopWon, setCoopWon] = useState(null)
  const [formError, setFormError] = useState('')

  const mode = scoreMode(modeKey)
  const selectedIds = Object.keys(selected)

  // Teams currently in use, plus the next one to offer (so Team C never appears
  // before Team B has a player). 0 teams used -> offer A, B.
  const usedTeams = [...new Set(selectedIds.map((uid) => selected[uid].team).filter(Boolean))].sort((a, b) => a - b)
  const maxTeam = usedTeams.length ? Math.max(...usedTeams) : 0
  const teamOptions = Array.from({ length: Math.max(2, maxTeam + 1) }, (_, i) => i + 1)

  const toggle = (uid) => {
    setFormError('')
    setSelected((prev) => {
      const next = { ...prev }
      if (next[uid]) {
        delete next[uid]
        if (winnerId === uid) setWinnerId(null)
      } else {
        next[uid] = { score: '', team: mode.team ? 1 : null }
      }
      return next
    })
  }

  const setScore = (uid, val) => {
    if (val !== '' && !/^-?\d+$/.test(val)) return
    setSelected((prev) => ({ ...prev, [uid]: { ...prev[uid], score: val } }))
  }
  const setTeam = (uid, team) => {
    setSelected((prev) => ({ ...prev, [uid]: { ...prev[uid], team } }))
  }
  const setTeamScore = (team, val) => {
    if (val !== '' && !/^-?\d+$/.test(val)) return
    setTeamScores((prev) => ({ ...prev, [team]: val }))
  }

  const changeMode = (key) => {
    setModeKey(key)
    setFormError('')
    setWinnerId(null)
    setWinnerTeam(null)
    setLowestWins(false)
    setCoopWon(null)
    // Reset team assignments when leaving/entering team modes.
    const m = scoreMode(key)
    setSelected((prev) => {
      const next = {}
      Object.keys(prev).forEach((uid) => { next[uid] = { score: prev[uid].score, team: m.team ? (prev[uid].team || 1) : null } })
      return next
    })
  }

  const nameOf = (p) => p.nickname || p.display_name || t('Player')

  const validate = () => {
    const n = selectedIds.length
    if (mode.key === 'cooperative') {
      if (n < 1) return t('Pick at least one player.')
      if (coopWon == null) return t('Did the table win?')
      return ''
    }
    if (n < 2) return t('Pick at least two players.')

    if (mode.key === 'individual_score') {
      if (selectedIds.some((uid) => selected[uid].score === '')) return t('Enter a score for every player')
    }
    if (mode.key === 'individual_winloss') {
      if (!winnerId || !selected[winnerId]) return t('Pick exactly one winner')
    }
    if (mode.team) {
      if (usedTeams.length < 2) return t('Use at least two teams')
      if (mode.key === 'team_score') {
        const withScore = selectedIds.filter((uid) => selected[uid].score !== '')
        if (withScore.length > 0 && withScore.length < n) {
          return t('Enter individual scores for everyone, or leave them all blank and score by team')
        }
        if (withScore.length === 0) {
          // Manual per-team scores required.
          if (usedTeams.some((tm) => !teamScores[tm] && teamScores[tm] !== 0 && teamScores[tm] !== '0')) {
            return t('Enter a score for each team')
          }
        }
      }
      if (mode.key === 'team_winloss') {
        if (!winnerTeam || !usedTeams.includes(winnerTeam)) return t('Pick exactly one winning team')
      }
    }
    return ''
  }

  const submit = async () => {
    const v = validate()
    if (v) return setFormError(v)
    setBusy(true)
    setFormError('')

    const p_players = selectedIds.map((uid) => ({
      user_id: uid,
      score: selected[uid].score === '' ? null : Number(selected[uid].score),
      is_winner: mode.key === 'individual_winloss' ? uid === winnerId : false,
      team: mode.team ? selected[uid].team : null,
    }))

    let p_teams = []
    if (mode.team) {
      p_teams = usedTeams.map((tm) => ({
        team: tm,
        score: teamScores[tm] === undefined || teamScores[tm] === '' ? null : Number(teamScores[tm]),
        is_winner: mode.key === 'team_winloss' ? tm === winnerTeam : false,
      }))
    }

    const { error: e } = await supabase.rpc('submit_game_play', {
      p_play_id: playId,
      p_mode: mode.key,
      p_lowest_wins: mode.lowestOption ? lowestWins : false,
      p_coop_won: mode.key === 'cooperative' ? coopWon : null,
      p_players,
      p_teams,
    })
    setBusy(false)
    if (e) return setFormError(e.message)
    await onSubmitted()
  }

  return (
    <div className="card record-form">
      <div className="row-between">
        <h2 style={{ margin: 0, fontSize: 18 }}>{gameName}</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDiscard} disabled={busy}>
          {t('Discard')}
        </button>
      </div>

      {/* Mode */}
      <div className="field-label" style={{ margin: '14px 0 6px' }}>{t('How were the scores kept?')}</div>
      <div className="mode-grid">
        {SCORE_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={'mode-btn' + (m.key === modeKey ? ' is-active' : '')}
            onClick={() => changeMode(m.key)}
          >
            <span className="mode-btn-label">{t(m.label)}</span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t(mode.hint)}</p>

      {mode.lowestOption && (
        <label className="check-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={lowestWins} onChange={(e) => setLowestWins(e.target.checked)} />
          <span>{t('Lowest score wins')}</span>
        </label>
      )}

      {mode.key === 'cooperative' && (
        <>
          <div className="field-label" style={{ margin: '14px 0 6px' }}>{t('Did the table win?')}</div>
          <div className="winloss-toggle">
            <button type="button" className={'wl-btn wl-won' + (coopWon === true ? ' is-active' : '')} onClick={() => setCoopWon(true)}>{t('Won')}</button>
            <button type="button" className={'wl-btn wl-lost' + (coopWon === false ? ' is-active' : '')} onClick={() => setCoopWon(false)}>{t('Lost')}</button>
          </div>
        </>
      )}

      {/* Players */}
      <div className="field-label" style={{ margin: '16px 0 6px' }}>{t('Who played?')}</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>{t('Tap a player to add them, then enter how it went.')}</p>
      <div className="player-pick">
        {participants.map((p) => {
          const on = !!selected[p.id]
          return (
            <button
              key={p.id}
              type="button"
              className={'pick-chip' + (on ? ' is-on' : '')}
              onClick={() => toggle(p.id)}
            >
              <Avatar name={nameOf(p)} src={p.avatar_url} size={22} />
              <span>{nameOf(p)}</span>
            </button>
          )
        })}
      </div>

      {/* Per-player rows for the selected players */}
      {selectedIds.length > 0 && (
        <div className="score-input-list">
          {participants.filter((p) => selected[p.id]).map((p) => (
            <div className="score-input-row" key={p.id}>
              <div className="score-input-who">
                <Avatar name={nameOf(p)} src={p.avatar_url} size={26} />
                <span>{nameOf(p)}</span>
              </div>
              <div className="score-input-controls">
                {mode.team && (
                  <div className="team-picker">
                    {teamOptions.map((tm) => (
                      <button
                        key={tm}
                        type="button"
                        className={'team-opt' + (selected[p.id].team === tm ? ' is-on' : '')}
                        onClick={() => setTeam(p.id, tm)}
                      >
                        {teamLetter(tm)}
                      </button>
                    ))}
                  </div>
                )}
                {mode.key === 'individual_winloss' && (
                  <button
                    type="button"
                    className={'winner-pick' + (winnerId === p.id ? ' is-on' : '')}
                    onClick={() => setWinnerId(p.id)}
                    title={t('Mark the winner')}
                  >
                    🏆
                  </button>
                )}
                {(mode.scores === 'required' || mode.scores === 'optional' || mode.scores === 'team') && (
                  <input
                    className="score-num"
                    type="text"
                    inputMode="numeric"
                    placeholder={mode.scores === 'required' ? '0' : t('Score (optional)')}
                    value={selected[p.id].score}
                    onChange={(e) => setScore(p.id, e.target.value)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Team-level inputs */}
      {mode.team && usedTeams.length > 0 && (
        <div className="team-block">
          {usedTeams.map((tm) => (
            <div className="team-row" key={tm}>
              <span className="team-row-name">{t('Team {letter}', { letter: teamLetter(tm) })}</span>
              {mode.key === 'team_winloss' && (
                <button
                  type="button"
                  className={'winner-pick' + (winnerTeam === tm ? ' is-on' : '')}
                  onClick={() => setWinnerTeam(tm)}
                  title={t('Mark the winning team')}
                >
                  🏆
                </button>
              )}
              <input
                className="score-num"
                type="text"
                inputMode="numeric"
                placeholder={mode.key === 'team_winloss' ? t('Team score (optional)') : t('Team score (optional)')}
                value={teamScores[tm] ?? ''}
                onChange={(e) => setTeamScore(tm, e.target.value)}
              />
            </div>
          ))}
          {mode.key === 'team_score' && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {t('Split players into teams. Enter individual scores (a team’s total is the sum) or score each team directly.')}
            </p>
          )}
        </div>
      )}

      {formError && <p className="center" style={{ color: 'var(--red-600)', fontSize: 13, marginTop: 10, marginBottom: 0 }}>{formError}</p>}

      <div className="form-row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? t('Saving…') : t('Save result')}
        </button>
      </div>
    </div>
  )
}
