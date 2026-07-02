import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n'
import { useGameCatalog } from '../lib/useGameCatalog'
import { groupPlaysByGame } from '../lib/format'
import { shareOrCopy } from '../lib/shareScore'

// What we need to render a game's result as shareable text. Scores are public, so
// no participant gate — anyone viewing a finished session can share its results.
const PLAY_SELECT = `
  id, game_name, mode, lowest_wins, coop_won, submitted_at,
  scores:session_play_scores(user_id, score, is_winner, team, player:profiles(nickname)),
  teams:session_play_teams(team, score, is_winner)
`

// Replaces ShareSessionButton on a finished session: instead of sharing the (now
// past, address-hidden) listing, the player picks one PLAY that was scored and
// shares that play's result — as a plain-text recap plus a deep link to its own
// score page. Wingspan played twice shows as two separate picks ("Wingspan #1",
// "Wingspan #2"), each with its own link. Uses the native share sheet, falling
// back to clipboard.
export default function ShareScoreButton({ session, label = 'Share Score', className = 'btn btn-secondary btn-sm' }) {
  const { t } = useLang()
  const { catalog } = useGameCatalog()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState(null) // [{ play, index, total }] | null until loaded
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const openPicker = async () => {
    setOpen(true)
    setCopied(false)
    if (entries) return // already loaded this mount
    setLoading(true)
    const { data } = await supabase
      .from('session_game_plays')
      .select(PLAY_SELECT)
      .eq('session_id', session.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
    // Freshest game on top, oldest play first within a repeated game (#1, #2…)
    // — same ordering the result accordion uses.
    setEntries(groupPlaysByGame(data ?? []))
    setLoading(false)
  }

  const canonicalOf = (play) => catalog.get(play.game_name.trim().toLowerCase()) || play.game_name

  const sharePlay = async ({ play }) => {
    // Short link to this play's own score page (one page per play). The play id
    // is globally unique, so the session id isn't needed in the URL — the page
    // and its preview resolve everything from the play id alone.
    const url = `${window.location.origin}/score/${play.id}`
    // Warm the OG preview image now (fire-and-forget): rendering it is the
    // slowest step, so kicking it off here means it's cached by the time the
    // recipient's chat app fetches it — the "copy, paste, send fast" case.
    new Image().src = `${window.location.origin}/api/session-image?play=${play.id}`
    await shareOrCopy({
      title: `BG Session — ${canonicalOf(play)}`,
      url,
      t,
      onDone: () => setOpen(false),
      onCopied: () => { setCopied(true); setTimeout(() => { setCopied(false); setOpen(false) }, 1500) },
    })
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
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Share a Game Result')}>
            <h2 style={{ marginTop: 0 }}>{t('Share a Game Result')}</h2>
            {copied && <div className="alert alert-success">{t('✓ Copied')}</div>}
            {loading ? (
              <div className="spinner" aria-label={t('Loading…')} />
            ) : entries && entries.length > 0 ? (
              <div className="stack" style={{ gap: 8, maxHeight: 312, overflowY: 'auto' }}>
                {entries.map((entry) => {
                  const { play, index, total } = entry
                  return (
                    <button
                      key={play.id}
                      type="button"
                      className="btn btn-secondary btn-block"
                      style={{ justifyContent: 'space-between' }}
                      onClick={() => sharePlay(entry)}
                    >
                      <span>{canonicalOf(play)}</span>
                      {total > 1 && <span className="chip-count">#{index}</span>}
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
