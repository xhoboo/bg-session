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
export default function GameScoreCard({ play, catalog, onEdit, onCancel, replayIndex, replayTotal, hideGameName }) {
  const { t } = useLang()
  const mode = scoreMode(play.mode)
  if (!mode) return null

  const scores = play.scores || []
  const teams = (play.teams || []).slice().sort((a, b) => a.team - b.team)
  const canonical = catalog?.get((play.game_name || '').trim().toLowerCase())
  const recorder = play.recorder
  const recorderName = recorder?.nickname || recorder?.display_name || t('Player')

  const playerName = (p) => p.player?.nickname || p.player?.display_name || t('Player')

  // A single player row (avatar, name, trailing content like a score/winner tag).
  const PlayerRow = ({ p, trailing, winner }) => (
    <div className={'score-player' + (winner ? ' is-winner' : '')}>
      <Link to={userPath(p.player?.nickname || p.user_id)} className="user-link">
        <Avatar name={playerName(p)} src={p.player?.avatar_url} size={28} />
        <span className="score-player-name">{playerName(p)}</span>
      </Link>
      {winner && <span className="score-trophy" aria-label={t('Winner')}>🏆</span>}
      {trailing}
    </div>
  )

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

  return (
    <div className="card score-card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          {(!hideGameName || replayTotal > 1) && (
            <div className="score-card-game">
              {!hideGameName && (canonical ? (
                <Link to={`/games/${encodeURIComponent(canonical)}`} className="chip-bring-name">{canonical}</Link>
              ) : (
                play.game_name
              ))}
              {replayTotal > 1 && (
                <span className="score-card-replay" title={t('Play {n} of {total}', { n: replayIndex, total: replayTotal })}>
                  #{replayIndex}
                </span>
              )}
            </div>
          )}
          <div className="score-card-mode">
            {t(mode.label)}
            {mode.lowestOption && play.lowest_wins && <span className="muted"> · {t('Lowest score wins')}</span>}
          </div>
        </div>
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

      <div className="spacer" />

      {mode.team ? teamBody() : mode.key === 'cooperative' ? coopBody() : individualBody()}

      <div className="score-card-foot muted">
        {t('Recorded by {name}', { name: recorderName })}
        {play.submitted_at && <span> · {formatDateShort(play.submitted_at)}</span>}
      </div>
    </div>
  )
}
