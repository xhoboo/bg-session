import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useLang } from '../lib/i18n'
import { formatDateTime, playerCount, isSessionFull, formatDuration, isSessionFinished } from '../lib/format'
import { useGameCatalog } from '../lib/useGameCatalog'
import { promptAuth } from '../lib/authPrompt'
import Avatar from '../components/Avatar'
import GameChip from '../components/GameChip'
import RecurrenceBadge from '../components/RecurrenceBadge'
import { SessionDetailSkeleton } from '../components/Skeleton'

// Read-only session page for guests (not signed in). Shows the same public
// listing info a signed-in user sees, plus the host and confirmed participants
// as PLAIN, non-clickable cards — guests can look but can't open a profile, join,
// chat, or see the address. Every member field comes from SECURITY DEFINER RPCs
// (get_public_session / get_public_participants), so `sessions` and `profiles`
// stay closed to anon. The signed-in experience lives in SessionDetail.jsx.
export default function GuestSessionDetail() {
  const { id } = useParams()
  const { t } = useLang()
  const { catalog, loading: catalogLoading } = useGameCatalog()

  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [sRes, pRes] = await Promise.all([
        supabase.rpc('get_public_session', { p_id: id }),
        supabase.rpc('get_public_participants', { p_session_id: id }),
      ])
      if (!active) return
      if (sRes.error || !sRes.data?.length) {
        setError(sRes.error?.message || t('Session not found.'))
        setLoading(false)
        return
      }
      setSession(sRes.data[0])
      // Host first, then approved guests.
      setParticipants((pRes.data ?? []).slice().sort((a, b) => Number(b.is_host) - Number(a.is_host)))
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

  return (
    <div className="container container-narrow">
      <Link to="/" className="muted" style={{ fontSize: 14 }}>{t('← Back to Browse')}</Link>

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

      {/* Join CTA — opens the sign-in popup. */}
      {!finished && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            {isFull ? t('Session full — join the waitlist?') : t('Want to join?')}
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {t('Sign in or create an account to join this session and message the host.')}
          </p>
          <button className="btn btn-primary btn-block" onClick={promptAuth}>{t('Sign In to Join')}</button>
        </div>
      )}

      {/* Confirmed participants — plain, non-clickable cards (public display
          info only; no real names / photos, no profile links). */}
      {participants.length > 0 && (
        <>
          <h2 className="section-title">{t("Who's Coming")} ({participants.length})</h2>
          <div className="participants-list">
            {participants.map((p) => {
              const name = p.nickname || p.display_name || t('Player')
              return (
                <div className="participant-card card" key={p.id}>
                  <Avatar name={name} src={p.avatar_url} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {name}
                      {p.is_host && <span className="badge badge-area">{t('Host')}</span>}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
