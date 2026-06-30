import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n'
import { formatDateTime, playerCount, isSessionFull, formatDuration, isSessionFinished } from '../lib/format'
import { useGameCatalog } from '../lib/useGameCatalog'
import { promptAuth } from '../lib/authPrompt'
import Avatar from '../components/Avatar'
import GameChip from '../components/GameChip'
import GameResultsAccordion from '../components/GameResultsAccordion'
import RecurrenceBadge from '../components/RecurrenceBadge'
import StarRating from '../components/StarRating'
import { SessionDetailSkeleton } from '../components/Skeleton'

// Read-only session page for guests (not signed in). Shows the same public
// listing info a signed-in user sees, plus — for finished sessions — its ratings
// and reviews with the reviewer's name MASKED (first letter only). Guests can
// look but can't open a profile, join, chat, or see the address; the confirmed
// participant list is intentionally hidden from guests (members-only). Every
// field comes from SECURITY DEFINER RPCs (get_public_session /
// get_public_session_ratings), so `sessions` and `profiles` stay closed to anon.
// The signed-in experience lives in SessionDetail.jsx.
export default function GuestSessionDetail() {
  const { id } = useParams()
  const { t } = useLang()
  const { catalog, loading: catalogLoading } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [ratings, setRatings] = useState([])
  const [plays, setPlays] = useState([]) // submitted game results (public)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [sRes, rRes, pRes] = await Promise.all([
        supabase.rpc('get_public_session', { p_id: id }),
        supabase.rpc('get_public_session_ratings', { p_session_id: id }),
        supabase.rpc('get_public_session_plays', { p_session_id: id }),
      ])
      if (!active) return
      if (sRes.error || !sRes.data?.length) {
        setError(sRes.error?.message || t('Session not found.'))
        setLoading(false)
        return
      }
      setSession(sRes.data[0])
      setRatings(rRes.data ?? [])
      setPlays(pRes.data ?? [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [id, t])

  if (loading) return <SessionDetailSkeleton />
  if (error || !session) {
    return (
      <div className="container container-narrow">
        <div className="alert alert-error">{error || t('Session not found.')}</div>
        <Link to="/" className="btn btn-secondary">{t('← Back to Browse')}</Link>
      </div>
    )
  }

  const isFull = isSessionFull(session)
  const finished = isSessionFinished(session)
  const hostName = session.host_nickname || session.host_display_name || t('Host')
  const listedGames = session.board_games
    ? session.board_games.split(',').map((g) => g.trim()).filter(Boolean)
    : []
  const avgRating = ratings.length
    ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
    : null
  const reviews = ratings.filter((r) => r.review)

  return (
    <div className="container container-narrow">
      <div className="row-between" style={{ marginTop: 12 }}>
        <h1 style={{ marginBottom: 0 }}>{session.title}</h1>
        <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
          <RecurrenceBadge session={session} />
          {finished ? (
            <span className="badge badge-done">{t('Done')}</span>
          ) : (
            <span className={'badge ' + (session.session_type === 'open' ? 'badge-open' : 'badge-approval')}>
              {session.session_type === 'open' ? t('Open') : t('Approval')}
            </span>
          )}
        </span>
      </div>

      {/* Host — shown but not clickable for guests (no profile-page access). */}
      <p className="subtitle" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {t('Hosted by')}{' '}
        <Avatar name={hostName} src={session.host_avatar_url} size={24} />
        {hostName}
      </p>

      {/* On a finished session the overall rating sits up here where Share lives
          for signed-in users — left-aligned, no card. The reviews live below. */}
      {finished && ratings.length >= 1 && (
        <div className="detail-actions">
          <div className="detail-rating" style={{ marginLeft: 0 }}>
            <StarRating value={Math.round(avgRating)} showValue={false} size={15} />
            <strong>{avgRating}/10</strong>
            {ratings.length >= 3 && <span className="muted">{t('· {n} ratings', { n: ratings.length })}</span>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="stack">
          <div className="row-between"><span className="muted">{t('When')}</span><strong>{formatDateTime(session.starts_at)}</strong></div>
          {formatDuration(session.duration_minutes) && (
            <div className="row-between"><span className="muted">{t('Duration')}</span><strong>{formatDuration(session.duration_minutes)}</strong></div>
          )}
          {session.region && (
            <div className="row-between"><span className="muted">{t('Region')}</span><span className="badge badge-area">{session.region}</span></div>
          )}
          {session.area && (
            <div className="row-between"><span className="muted">{t('Area')}</span><span className="badge badge-area">{session.area}</span></div>
          )}
          <div className="row-between"><span className="muted">{t('Players')}</span><strong>{playerCount(session)}{isFull ? ` ${t('· full')}` : ''}{session.min_players > 1 ? ` ${t('· min {n}', { n: session.min_players })}` : ''}</strong></div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>{t('Board Games')}</div>
            {listedGames.length > 0 ? (
              <div className="chips">
                {listedGames.map((g) => (
                  <GameChip key={g} name={g} catalog={catalog} loading={catalogLoading} />
                ))}
              </div>
            ) : (
              <div>{t('To be decided')}</div>
            )}
          </div>

          {!finished && (
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>{t('Address')}</div>
              <div className="address-locked">{t('🔒 The full address is revealed once the host confirms your spot.')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Reviews — shown to everyone (guests included) once a session has
          finished. The overall rating sits up top by the header; here we list
          the written reviews. The reviewer's full public nickname shows (from
          the RPC), with the avatar hidden for guests — just the name. */}
      {finished && reviews.length > 0 && (
        <>
          <h2 className="section-title">{t('Reviews')}</h2>
          <div className="card">
            {reviews.map((r, i) => (
              <div className="review-item" key={i}>
                <span className="user-link user-link-static">{r.reviewer_name}</span>
                <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{r.review}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Game results — the session's submitted scores, shown read-only to
          guests. Each game is collapsed to its name + order; tapping it expands
          the score breakdown (accordion). Player names aren't clickable here
          (no profile-page access). */}
      {plays.length > 0 && (
        <>
          <h2 className="section-title">{t('Game Scores')}</h2>
          <GameResultsAccordion plays={plays} catalog={catalog} linkPlayers={false} />
        </>
      )}

      {/* Join CTA — opens the sign-in popup. */}
      {!finished && (
        <div className="card">
          <button className="btn btn-primary btn-block" onClick={promptAuth}>{t('Sign In to Join')}</button>
        </div>
      )}
    </div>
  )
}
