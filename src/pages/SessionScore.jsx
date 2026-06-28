import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
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
import ConfirmModal from '../components/ConfirmModal'

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
  const [searchParams] = useSearchParams()
  const { catalog } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [plays, setPlays] = useState([])          // submitted results
  const [drafts, setDrafts] = useState([])        // live "being recorded" locks
  const [draftId, setDraftId] = useState(null)    // my open draft (form target)
  const [draftGame, setDraftGame] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(null)  // play pending discard
  const [editPlay, setEditPlay] = useState(null)            // submitted play being edited

  const load = useCallback(async () => {
    setError('')
    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('id, title, host_id, starts_at, duration_minutes')
      .eq('id', id)
      .maybeSingle()
    if (sErr || !s) {
      setError(sErr?.message || 'Session not found.')
      setLoading(false)
      return
    }
    setSession(s)

    // Participants (host + approved guests) — the pool of possible players.
    const [hostRes, guestsRes, playsRes, draftsRes] = await Promise.all([
      supabase.from('profiles').select('id, nickname, display_name, avatar_url').eq('id', s.host_id).maybeSingle(),
      supabase
        .from('join_requests')
        .select('guest:profiles(id, nickname, display_name, avatar_url)')
        .eq('session_id', id)
        .eq('status', 'approved'),
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
        if (!draftId && !editPlay) load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, draftId, editPlay, load])

  const isParticipant = session && (session.host_id === user.id || participants.some((p) => p.id === user.id))
  const scoringOpen = session && isScoringOpen(session)

  // Results are grouped by game so a game's plays sit together: oldest-first
  // within each game (so repeats read #1, #2, #3…), and the groups themselves
  // ordered by their most recent play so the freshest game stays on top.
  const orderedPlays = useMemo(() => {
    const ts = (p) => (p.submitted_at ? new Date(p.submitted_at).getTime() : 0)
    const groups = new Map() // lower(game) -> { name, plays: [] }
    plays.forEach((p) => {
      const low = p.game_name.toLowerCase()
      if (!groups.has(low)) groups.set(low, { name: p.game_name, plays: [] })
      groups.get(low).plays.push(p)
    })
    const ordered = [...groups.values()].map((g) => ({
      name: g.name,
      plays: g.plays.slice().sort((a, b) => ts(a) - ts(b)),
    }))
    ordered.sort((a, b) => Math.max(...b.plays.map(ts)) - Math.max(...a.plays.map(ts)))
    return ordered.flatMap((g) =>
      g.plays.map((p, i) => ({ play: p, index: i + 1, total: g.plays.length }))
    )
  }, [plays])

  // Focused view: a game chip on the session page links here with ?game=<slug>
  // to show just that one game's results (oldest-first), with no recording UI —
  // scores are only ever entered from the FAB. Matched by the chip's anchor slug.
  const focusSlug = searchParams.get('game')
  const focus = useMemo(() => {
    if (!focusSlug) return null
    const match = plays.find((p) => gameAnchor(p.game_name) === focusSlug)
    if (!match) return { name: null, plays: [] }
    const low = match.game_name.toLowerCase()
    const ts = (p) => (p.submitted_at ? new Date(p.submitted_at).getTime() : 0)
    return {
      name: match.game_name,
      plays: plays.filter((p) => p.game_name.toLowerCase() === low).sort((a, b) => ts(a) - ts(b)),
    }
  }, [focusSlug, plays])

  const discardDraft = async () => {
    if (!draftId) return
    setBusy(true)
    await supabase.rpc('delete_game_play', { p_play_id: draftId }).then(() => {}, () => {})
    setBusy(false)
    setDraftId(null)
    setDraftGame('')
    await load()
  }

  const cancelResult = (play) => setConfirmCancel(play)

  const confirmCancelResult = async () => {
    const play = confirmCancel
    if (!play) return
    setConfirmCancel(null)
    setBusy(true)
    const { error: e } = await supabase.rpc('delete_game_play', { p_play_id: play.id })
    setBusy(false)
    if (e) return setError(e.message)
    await load()
  }

  const onSubmitted = async () => {
    setDraftId(null)
    setDraftGame('')
    setEditPlay(null)
    await load()
  }

  // One result card. Within 30 min of recording, the recorder gets Edit + Discard
  // buttons (only on the full page — the focused chip view is read-only). Editing
  // bumps submitted_at server-side, so the 30-min window resets after each save.
  const renderCard = (p, index, total, allowEdit = true) => {
    const owned =
      allowEdit &&
      scoringOpen &&
      p.recorded_by === user.id &&
      p.submitted_at &&
      Date.now() < new Date(p.submitted_at).getTime() + 30 * 60_000
    return (
      <GameScoreCard
        key={p.id}
        play={p}
        catalog={catalog}
        replayIndex={total > 1 ? index : undefined}
        replayTotal={total > 1 ? total : undefined}
        onEdit={owned ? setEditPlay : undefined}
        onCancel={owned ? cancelResult : undefined}
      />
    )
  }

  if (loading) {
    return <div className="container container-narrow"><div className="spinner" aria-label="Loading" /></div>
  }
  if (error && !session) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-secondary">{t('← Back to Browse')}</Link>
      </div>
    )
  }
  // Focused, read-only view of a single game's results (reached from a chip on
  // the session page). Public — no participant gate — and no recording UI.
  if (focusSlug) {
    const canonical = focus.name ? (catalog.get(focus.name.trim().toLowerCase()) || focus.name) : null
    return (
      <div className="container container-narrow">
        <h1 style={{ marginTop: 12, marginBottom: 4 }}>{t('Game Results')}</h1>
        <p className="subtitle" style={{ marginTop: 0 }}>{canonical || session.title}</p>
        {focus.plays.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>{t('No games have been scored yet.')}</p>
        ) : (
          <div className="stack" style={{ marginTop: 16 }}>
            {focus.plays.map((p, i) => renderCard(p, i + 1, focus.plays.length, false))}
          </div>
        )}
        <Link to={`/sessions/${id}`} className="btn btn-secondary btn-block" style={{ marginTop: 20 }}>{t('← Back to Session')}</Link>
      </div>
    )
  }

  if (!isParticipant) {
    // Results are public, but recording is participant-only — send onlookers to
    // the detail page where the read-only results live.
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{t('Only participants can record scores')}</div>
        <Link to={`/sessions/${id}`} className="btn btn-secondary">{t('← Back to Session')}</Link>
      </div>
    )
  }

  const started = hasSessionStarted(session)
  const myDraft = drafts.find((d) => d.id === draftId)

  return (
    <div className="container container-narrow">
      <h1 style={{ marginTop: 12, marginBottom: 4 }}>{t('Game Results')}</h1>
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

      {/* Recording form — shown only while the user has an open draft, which is
          started from the FAB's game picker. Otherwise this page is a read-only
          list of the session's results (no "Score a Game" button lives here). */}
      {scoringOpen && myDraft && (
        <RecordForm
          playId={draftId}
          gameName={draftGame}
          participants={participants}
          busy={busy}
          setBusy={setBusy}
          onSubmitted={onSubmitted}
          onDiscard={discardDraft}
        />
      )}

      {/* Edit form — the recorder re-opening a submitted result within its 30-min
          window. Same form, pre-filled, submitting back through submit_game_play. */}
      {scoringOpen && editPlay && (
        <RecordForm
          key={editPlay.id}
          editMode
          playId={editPlay.id}
          gameName={editPlay.game_name}
          initial={playToInitial(editPlay)}
          participants={participants}
          busy={busy}
          setBusy={setBusy}
          onSubmitted={onSubmitted}
          onDiscard={() => setEditPlay(null)}
        />
      )}

      {/* ---- Results ---- */}
      {plays.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>{t('No games have been scored yet.')}</p>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {orderedPlays.map(({ play: p, index, total }) => renderCard(p, index, total))}
        </div>
      )}

      <Link to={`/sessions/${id}`} className="btn btn-secondary btn-block" style={{ marginTop: 20 }}>{t('← Back to Session')}</Link>

      {confirmCancel && (
        <ConfirmModal
          message={t('Remove this game from the session record? This can’t be undone.')}
          confirmLabel={t('Discard')}
          danger
          busy={busy}
          onCancel={() => setConfirmCancel(null)}
          onConfirm={confirmCancelResult}
        />
      )}
    </div>
  )
}

// Turn a submitted play (with embedded scores/teams) back into RecordForm's
// initial state, so the edit form opens showing exactly what was recorded.
function playToInitial(play) {
  const isTeam = play.mode === 'team_score' || play.mode === 'team_winloss'
  const scores = play.scores || []
  const teams = play.teams || []
  const selected = {}
  scores.forEach((s) => {
    selected[s.user_id] = {
      score: s.score == null ? '' : String(s.score),
      team: isTeam ? (s.team ?? 1) : null,
    }
  })
  // Per-team score boxes are only the manual entry path: for team_score with
  // individual scores the stored team rows are derived sums, so leave them blank.
  const teamScores = {}
  const playersScored = scores.some((s) => s.score != null)
  if (!(play.mode === 'team_score' && playersScored)) {
    teams.forEach((tm) => { teamScores[tm.team] = tm.score == null ? '' : String(tm.score) })
  }
  return {
    modeKey: play.mode,
    lowestWins: !!play.lowest_wins,
    coopWon: play.mode === 'cooperative' ? play.coop_won : null,
    selected,
    winnerId: play.mode === 'individual_winloss' ? (scores.find((s) => s.is_winner)?.user_id ?? null) : null,
    winnerTeam: play.mode === 'team_winloss' ? (teams.find((tm) => tm.is_winner)?.team ?? null) : null,
    teamScores,
  }
}

// ---------------------------------------------------------------------------
// RecordForm — fills in a draft and submits it. Lives here because it's tightly
// bound to the page's participant list and draft lifecycle. In `editMode` it's
// pre-filled from `initial` and re-submits an existing result instead of a draft
// (submit_game_play accepts both — see migration 0060).
// ---------------------------------------------------------------------------
function RecordForm({ playId, gameName, participants, busy, setBusy, onSubmitted, onDiscard, editMode, initial }) {
  const { t } = useLang()
  const [modeKey, setModeKey] = useState(initial?.modeKey ?? 'individual_score')
  const [selected, setSelected] = useState(initial?.selected ?? {})   // userId -> { score, team }
  const [winnerId, setWinnerId] = useState(initial?.winnerId ?? null) // individual_winloss
  const [winnerTeam, setWinnerTeam] = useState(initial?.winnerTeam ?? null) // team_winloss
  const [teamScores, setTeamScores] = useState(initial?.teamScores ?? {}) // team(int) -> score string
  const [lowestWins, setLowestWins] = useState(initial?.lowestWins ?? false)
  const [coopWon, setCoopWon] = useState(initial?.coopWon ?? null)
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
          {editMode ? t('Cancel') : t('Discard')}
        </button>
      </div>

      {/* Mode */}
      <div className="field-label" style={{ margin: '14px 0 6px' }}>{t('Scoring Type')}</div>
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
                placeholder={t('Team Score (optional)')}
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
          {busy ? t('Saving…') : editMode ? t('Save Changes') : t('Save Result')}
        </button>
      </div>
    </div>
  )
}
