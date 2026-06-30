import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { useLang } from '../lib/i18n'
import { scoreMode, teamLetter, formatDateShort } from '../lib/format'
import { userPath } from '../lib/nickname'

// One submitted game result. Used both on the score page and (read-only) in the
// finished session's "Game results" on SessionDetail. `play` is a row from
// session_game_plays with embedded `scores` (session_play_scores + player
// profile) and `teams` (session_play_teams). Scores are public, so this renders
// for anyone — only the recorder, inside the 30-minute window, gets the Edit and
// Discard buttons (passed in as `onEdit` / `onCancel`).
//
// `collapsible` makes the card an accordion (used in the guest view): only the
// game name + mode show until the header is tapped, then the score breakdown
// expands. In that mode the name is plain text, not a catalog link, so the whole
// header is one safe toggle.
export default function GameScoreCard({ play, catalog, onEdit, onCancel, replayIndex, replayTotal, hideGameName, linkPlayers = true, collapsible = false }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const mode = scoreMode(play.mode)
  if (!mode) return null

  const scores = play.scores || []
  const teams = (play.teams || []).slice().sort((a, b) => a.team - b.team)
  const canonical = catalog?.get((play.game_name || '').trim().toLowerCase())
  const recorder = play.recorder
  const recorderName = recorder?.nickname || recorder?.display_name || t('Player')

  const playerName = (p) => p.player?.nickname || p.player?.display_name || t('Player')

  // A single player row (avatar, name, trailing content like a score/winner tag).
  // Names link to the player's profile, except in the guest view (linkPlayers
  // false) where there's no profile-page access — then it's plain, unclickable.
  const PlayerRow = ({ p, trailing, winner }) => {
    const who = (
      <>
        <Avatar name={playerName(p)} src={p.player?.avatar_url} size={28} />
        <span className="score-player-name">{playerName(p)}</span>
      </>
    )
    return (
      <div className={'score-player' + (winner ? ' is-winner' : '')}>
        {linkPlayers ? (
          <Link to={userPath(p.player?.nickname || p.user_id)} className="user-link">{who}</Link>
        ) : (
          <span className="user-link user-link-static">{who}</span>
        )}
        {winner && <span className="score-trophy" aria-label={t('Winner')}>🏆</span>}
        {trailing}
      </div>
    )
  }

  // Individual modes — flat list, winners first then by score.
  const individualBody = () => {
    const ranked = scores.slice().sort((a, b) => {
      if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1
      if (a.score == null && b.score == null) return 0
      if (a.score == null) return 1
      if (b.score == null) return -1
      return play.lowest_wins ? a.score - b.score : b.score - a.score
    })
    return (
      <div className="score-players">
        {ranked.map((p) => (
          <PlayerRow
            key={p.user_id}
            p={p}
            winner={p.is_winner}
            trailing={p.score != null && <span className="score-value">{p.score}</span>}
          />
        ))}
      </div>
    )
  }

  // Team modes — grouped by team, each with its team score / winner tag.
  const teamBody = () => (
    <div className="score-teams">
      {teams.map((team) => {
        const members = scores.filter((s) => s.team === team.team)
        return (
          <div className={'score-team' + (team.is_winner ? ' is-winner' : '')} key={team.team}>
            <div className="score-team-head">
              <span className="score-team-name">
                {t('Team {letter}', { letter: teamLetter(team.team) })}
                {team.is_winner && <span className="score-trophy" aria-label={t('Winner')}> 🏆</span>}
              </span>
              {team.score != null && <span className="score-value">{team.score}</span>}
            </div>
            <div className="score-players">
              {members.map((p) => (
                <PlayerRow
                  key={p.user_id}
                  p={p}
                  trailing={p.score != null && <span className="score-value score-value-sm">{p.score}</span>}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  // Cooperative — one shared outcome, then the players (optional scores).
  const coopBody = () => (
    <>
      <div className={'coop-banner ' + (play.coop_won ? 'coop-won' : 'coop-lost')}>
        {play.coop_won ? t('Won') : t('Lost')}
      </div>
      <div className="score-players">
        {scores.map((p) => (
          <PlayerRow
            key={p.user_id}
            p={p}
            trailing={p.score != null && <span className="score-value score-value-sm">{p.score}</span>}
          />
        ))}
      </div>
    </>
  )

  // Game name + mode + the replayed-game order tag (#1, #2…), which sits beside
  // the mode label, aligned with it — so it reads "Individual Scores #2". In a
  // collapsible card the name is plain text (no catalog link) so the header is a
  // single safe toggle.
  const titleBlock = (
    <div>
      {!hideGameName && (
        <div className="score-card-game">
          {!collapsible && canonical ? (
            <Link to={`/games/${encodeURIComponent(canonical)}`} className="chip-bring-name">{canonical}</Link>
          ) : (
            canonical || play.game_name
          )}
        </div>
      )}
      <div className="score-card-mode">
        {t(mode.label)}
        {replayTotal > 1 && (
          <span className="score-card-replay" title={t('Play {n} of {total}', { n: replayIndex, total: replayTotal })}>
            #{replayIndex}
          </span>
        )}
        {mode.lowestOption && play.lowest_wins && <span className="muted"> · {t('Lowest score wins')}</span>}
      </div>
    </div>
  )

  const body = (
    <>
      <div className="spacer" />
      {mode.team ? teamBody() : mode.key === 'cooperative' ? coopBody() : individualBody()}
      <div className="score-card-foot muted">
        {t('Recorded by {name}', { name: recorderName })}
        {play.submitted_at && <span> · {formatDateShort(play.submitted_at)}</span>}
      </div>
    </>
  )

  // Accordion card: tap the header to reveal the scores. The header is a div with
  // a button role (not a <button>) because it wraps block-level title markup.
  // Collapsed, it shows only the game name and the replay order tag (#1, #2…) —
  // the mode label lives only on the expanded score page, not here.
  if (collapsible) {
    const toggle = () => setOpen((o) => !o)
    return (
      <div className={'card score-card score-card-acc' + (open ? ' is-open' : '')}>
        <div
          className="score-card-toggle"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle()
            }
          }}
        >
          <div className="score-card-game">
            {replayTotal > 1 && (
              <span className="score-card-replay" title={t('Play {n} of {total}', { n: replayIndex, total: replayTotal })}>
                #{replayIndex}
              </span>
            )}
            {canonical || play.game_name}
          </div>
          <span className="score-card-chevron" aria-hidden="true">▾</span>
        </div>
        {open && (
          <>
            {/* Scoring type returns here once expanded — it's kept out of the
                collapsed header to keep that to just the game name + order. */}
            <div className="score-card-mode">
              {t(mode.label)}
              {mode.lowestOption && play.lowest_wins && <span className="muted"> · {t('Lowest score wins')}</span>}
            </div>
            {body}
            {/* Recorder controls live at the foot of the expanded card (the
                collapsed header is a toggle, so they can't sit up there). */}
            {(onEdit || onCancel) && (
              <div className="score-card-actions" style={{ marginTop: 12 }}>
                {onEdit && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(play)}>
                    {t('Edit')}
                  </button>
                )}
                {onCancel && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => onCancel(play)}>
                    {t('Discard')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="card score-card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        {titleBlock}
        {(onEdit || onCancel) && (
          <div className="score-card-actions">
            {onEdit && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(play)}>
                {t('Edit')}
              </button>
            )}
            {onCancel && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onCancel(play)}>
                {t('Discard')}
              </button>
            )}
          </div>
        )}
      </div>
      {body}
    </div>
  )
}
