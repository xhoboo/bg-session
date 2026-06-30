import GameScoreCard from './GameScoreCard'
import { groupPlaysByGame } from '../lib/format'

// The compact, collapsed-by-default list of a session's game results — shared by
// the guest + signed-in session pages and the score page. Plays are shown in the
// order they were recorded (earliest first), each game keeping its replay tag
// (#1, #2…). `linkPlayers` makes player names link to their profiles (off for
// guests). When `isEditable(play)` is true, that card's expanded body shows the
// recorder's Edit/Discard buttons (onEdit/onCancel) — used on the score page
// within the 30-minute edit window.
export default function GameResultsAccordion({ plays, catalog, linkPlayers = true, isEditable, onEdit, onCancel }) {
  const ordered = groupPlaysByGame(plays)
    .slice()
    .sort((a, b) => new Date(a.play.submitted_at) - new Date(b.play.submitted_at))

  return (
    <div className="score-accordion">
      {ordered.map(({ play, index, total }) => {
        const editable = isEditable ? isEditable(play) : false
        return (
          <GameScoreCard
            key={play.id}
            play={play}
            catalog={catalog}
            collapsible
            linkPlayers={linkPlayers}
            replayIndex={total > 1 ? index : undefined}
            replayTotal={total > 1 ? total : undefined}
            onEdit={editable ? onEdit : undefined}
            onCancel={editable ? onCancel : undefined}
          />
        )
      })}
    </div>
  )
}
