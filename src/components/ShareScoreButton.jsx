import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n'
import { useGameCatalog } from '../lib/useGameCatalog'
import { scoreMode, teamLetter, gameAnchor } from '../lib/format'

// What we need to render a game's result as shareable text. Scores are public, so
// no participant gate — anyone viewing a finished session can share its results.
const PLAY_SELECT = `
  id, game_name, mode, lowest_wins, coop_won, submitted_at,
  scores:session_play_scores(user_id, score, is_winner, team, player:profiles(nickname)),
  teams:session_play_teams(team, score, is_winner)
`

// Replaces ShareSessionButton on a finished session: instead of sharing the (now
// past, address-hidden) listing, the player picks one of the games that were
// scored and shares that game's result — as a plain-text recap plus a deep link
// to its card. Uses the native share sheet, falling back to clipboard.
export default function ShareScoreButton({ session, label = 'Share score', className = 'btn btn-secondary btn-sm' }) {
  const { t } = useLang()
  const { catalog } = useGameCatalog()
  const [open, setOpen] = useState(false)
  const [games, setGames] = useState(null) // [{ name, plays: [...] }] | null until loaded
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const openPicker = async () => {
    setOpen(true)
    setCopied(false)
    if (games) return // already loaded this mount
    setLoading(true)
    const { data } = await supabase
      .from('session_game_plays')
      .select(PLAY_SELECT)
      .eq('session_id', session.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
    // Group plays by game (case-insensitive), keeping the first spelling seen and
    // oldest-play-first within each game.
    const groups = new Map()
    ;(data ?? []).forEach((p) => {
      const low = p.game_name.toLowerCase()
      if (!groups.has(low)) groups.set(low, { name: p.game_name, plays: [] })
      groups.get(low).plays.push(p)
    })
    setGames([...groups.values()])
    setLoading(false)
  }

  // Shared content reaches people outside the app, so use the public nickname
  // only — never display_name (it can hold a real name from a Google sign-in).
  const nameOf = (s) => s.player?.nickname?.trim() || t('Player')

  // Lines describing one play's outcome (no header — the caller adds that).
  const playLines = (p) => {
    const mode = scoreMode(p.mode)
    if (!mode) return []
    const scores = p.scores || []
    const out = []

    if (mode.team) {
      const teams = (p.teams || []).slice().sort((a, b) => a.team - b.team)
      teams.forEach((team) => {
        const head = `${t('Team {letter}', { letter: teamLetter(team.team) })}`
          + (team.is_winner ? ' 🏆' : '')
          + (team.score != null ? ` — ${team.score}` : '')
        out.push(head)
        scores.filter((s) => s.team === team.team).forEach((s) => {
          out.push(`  • ${nameOf(s)}${s.score != null ? `: ${s.score}` : ''}`)
        })
      })
    } else if (mode.key === 'cooperative') {
      out.push(p.coop_won ? `✅ ${t('Won')}` : `❌ ${t('Lost')}`)
      scores.forEach((s) => out.push(`  • ${nameOf(s)}${s.score != null ? `: ${s.score}` : ''}`))
    } else {
      // Individual: winners first, then by score (lowest_wins flips the order).
      const ranked = scores.slice().sort((a, b) => {
        if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1
        if (a.score == null && b.score == null) return 0
        if (a.score == null) return 1
        if (b.score == null) return -1
        return p.lowest_wins ? a.score - b.score : b.score - a.score
      })
      ranked.forEach((s) => {
        out.push(`${s.is_winner ? '🏆 ' : '• '}${nameOf(s)}${s.score != null ? `: ${s.score}` : ''}`)
      })
    }
    return out
  }

  const buildText = (game) => {
    const canonical = catalog.get(game.name.trim().toLowerCase()) || game.name
    const lines = [`🎲 ${canonical} · ${session.title}`]
    game.plays.forEach((p, i) => {
      lines.push('')
      if (game.plays.length > 1) lines.push(t('Game {n}', { n: i + 1 }))
      lines.push(...playLines(p))
    })
    return lines.join('\n')
  }

  const shareGame = async (game) => {
    const text = buildText(game)
    const url = `${window.location.origin}/sessions/${session.id}/score?game=${gameAnchor(game.name)}`
    const canonical = catalog.get(game.name.trim().toLowerCase()) || game.name
    const shareData = { title: `BG Session — ${canonical}`, text, url }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
        setOpen(false)
        return
      } catch (err) {
        if (err?.name === 'AbortError') { setOpen(false); return } // user closed the sheet
        // any other failure: fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => { setCopied(false); setOpen(false) }, 1500)
    } catch {
      window.prompt(t('Copy this game’s result:'), `${text}\n${url}`)
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={openPicker}>
        <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-0.12em', marginRight: 6 }}>
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="M8.4 10.9l7.2-4.2" />
          <path d="M8.4 13.1l7.2 4.2" />
        </svg>
        {t(label)}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Share a game result')}>
            <h2 style={{ marginTop: 0 }}>{t('Share a game result')}</h2>
            <p className="muted" style={{ marginTop: 0 }}>{t('Pick a game to share its scores.')}</p>
            {copied && <div className="alert alert-success">{t('✓ Copied')}</div>}
            {loading ? (
              <div className="spinner" aria-label={t('Loading…')} />
            ) : games && games.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                {games.map((g) => {
                  const canonical = catalog.get(g.name.trim().toLowerCase()) || g.name
                  return (
                    <button
                      key={g.name}
                      type="button"
                      className="btn btn-secondary btn-block"
                      style={{ justifyContent: 'space-between' }}
                      onClick={() => shareGame(g)}
                    >
                      <span>{canonical}</span>
                      {g.plays.length > 1 && <span className="chip-count">×{g.plays.length}</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="muted">{t('No games have been scored yet.')}</p>
            )}
            <div className="form-row" style={{ marginTop: 14 }}>
              <button className="btn btn-secondary btn-block" onClick={() => setOpen(false)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
