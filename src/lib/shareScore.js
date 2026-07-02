import { scoreMode, teamLetter } from './format'

// Shared by ShareScoreButton (picks one play from a session to share) and the
// per-play score page (shares the single play it's showing). Keeps the share
// text and the native-share/clipboard dance in one place instead of two.

// Shared content reaches people outside the app, so use the public nickname
// only — never display_name (it can hold a real name from a Google sign-in).
const nameOf = (s, t) => s.player?.nickname?.trim() || t('Player')

// Lines describing one play's outcome (no header — the caller adds that).
export function playResultLines(play, t) {
  const mode = scoreMode(play.mode)
  if (!mode) return []
  const scores = play.scores || []
  const out = []

  if (mode.team) {
    const teams = (play.teams || []).slice().sort((a, b) => a.team - b.team)
    teams.forEach((team) => {
      const head = `${t('Team {letter}', { letter: teamLetter(team.team) })}`
        + (team.is_winner ? ' 🏆' : '')
        + (team.score != null ? ` — ${team.score}` : '')
      out.push(head)
      scores.filter((s) => s.team === team.team).forEach((s) => {
        out.push(`  • ${nameOf(s, t)}${s.score != null ? `: ${s.score}` : ''}`)
      })
    })
  } else if (mode.key === 'cooperative') {
    out.push(play.coop_won ? `✅ ${t('Won')}` : `❌ ${t('Lost')}`)
    scores.forEach((s) => out.push(`  • ${nameOf(s, t)}${s.score != null ? `: ${s.score}` : ''}`))
  } else {
    // Individual: winners first, then by score (lowest_wins flips the order).
    const ranked = scores.slice().sort((a, b) => {
      if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1
      if (a.score == null && b.score == null) return 0
      if (a.score == null) return 1
      if (b.score == null) return -1
      return play.lowest_wins ? a.score - b.score : b.score - a.score
    })
    ranked.forEach((s) => {
      out.push(`${s.is_winner ? '🏆 ' : '• '}${nameOf(s, t)}${s.score != null ? `: ${s.score}` : ''}`)
    })
  }
  return out
}

// Full share text for one play: a header line (game + its #N replay tag +
// session title), then the result lines.
export function buildPlayShareText({ play, canonical, sessionTitle, replayIndex, replayTotal, t }) {
  const label = replayTotal > 1 ? `${canonical} #${replayIndex}` : canonical
  return [`🎲 ${label} · ${sessionTitle}`, '', ...playResultLines(play, t)].join('\n')
}

// Fires the native share sheet for { title, text, url }; falls back to the
// clipboard, then a prompt() if clipboard access also fails.
export async function shareOrCopy({ title, text, url, t, onDone, onCopied }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      onDone?.()
      return
    } catch (err) {
      if (err?.name === 'AbortError') { onDone?.(); return } // user closed the sheet
      // any other failure: fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    onCopied?.()
  } catch {
    window.prompt(t('Copy this game’s result:'), `${text}\n${url}`)
    onDone?.()
  }
}
